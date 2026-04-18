// Package storage persists session metadata as one JSON file per session.
//
// We deliberately avoid a database here — the data is small, write rate is
// human-paced, and JSON files survive corruption better than an embedded
// store.
package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// ErrNotFound is returned by Get/Delete when the session id is unknown.
var ErrNotFound = errors.New("session not found")

// Store is concurrency-safe; the mutex serialises all filesystem writes
// (reads are also serialised — fine at human scale).
type Store struct {
	mu  sync.RWMutex
	dir string
}

// New returns a Store rooted at config.SessionsDir(), creating it if
// missing.
func New() (*Store, error) {
	if err := config.EnsureDirs(); err != nil {
		return nil, err
	}
	return &Store{dir: config.SessionsDir()}, nil
}

func (s *Store) path(id string) string {
	return filepath.Join(s.dir, id+".json")
}

// Save writes (or overwrites) the session JSON.
func (s *Store) Save(sess *models.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeLocked(sess)
}

func (s *Store) writeLocked(sess *models.Session) error {
	b, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path(sess.ID) + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(sess.ID))
}

// Get returns the session by id or ErrNotFound.
func (s *Store) Get(id string) (*models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, err := os.ReadFile(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var sess models.Session
	if err := json.Unmarshal(b, &sess); err != nil {
		return nil, fmt.Errorf("decode %s: %w", id, err)
	}
	return &sess, nil
}

// List returns all sessions; sorted by UpdatedAt desc (most-recent first).
// Corrupt files are skipped (logged would be ideal — leave to caller).
func (s *Store) List() ([]*models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := make([]*models.Session, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.dir, e.Name()))
		if err != nil {
			continue
		}
		var sess models.Session
		if err := json.Unmarshal(b, &sess); err != nil {
			continue
		}
		out = append(out, &sess)
	}
	// Insertion-sort by UpdatedAt desc — list is small in practice.
	for i := 1; i < len(out); i++ {
		j := i
		for j > 0 && out[j].UpdatedAt.After(out[j-1].UpdatedAt) {
			out[j], out[j-1] = out[j-1], out[j]
			j--
		}
	}
	return out, nil
}

// Delete removes the session JSON. Missing file is not an error.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	err := os.Remove(s.path(id))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
