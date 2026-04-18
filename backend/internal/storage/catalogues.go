// Package storage also persists the two user-level catalogues: custom
// agents and MCP servers. Each is a single JSON file under AppHome(),
// protected by a mutex. Both collections are small (tens of entries at
// most) so we keep the entire collection in memory and rewrite on
// change.
package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/sanchar10/copilot-buddy/backend/internal/config"
	"github.com/sanchar10/copilot-buddy/backend/internal/models"
)

// ErrAgentNotFound is returned by AgentStore.Delete / Get for unknown names.
var ErrAgentNotFound = errors.New("agent not found")

// ErrMCPNotFound is returned by MCPStore.Delete / Get for unknown names.
var ErrMCPNotFound = errors.New("mcp server not found")

// ----------------------------------------------------------------------
// AgentStore
// ----------------------------------------------------------------------

type AgentStore struct {
	mu   sync.RWMutex
	path string
}

func NewAgentStore() (*AgentStore, error) {
	if err := config.EnsureDirs(); err != nil {
		return nil, err
	}
	return &AgentStore{path: filepath.Join(config.AppHome(), "agents.json")}, nil
}

func (s *AgentStore) loadLocked() (map[string]models.CustomAgent, error) {
	out := map[string]models.CustomAgent{}
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *AgentStore) writeLocked(all map[string]models.CustomAgent) error {
	b, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *AgentStore) List() ([]models.CustomAgent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	out := make([]models.CustomAgent, 0, len(all))
	for _, v := range all {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *AgentStore) Get(name string) (*models.CustomAgent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	a, ok := all[name]
	if !ok {
		return nil, ErrAgentNotFound
	}
	return &a, nil
}

func (s *AgentStore) Save(a models.CustomAgent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	all[a.Name] = a
	return s.writeLocked(all)
}

func (s *AgentStore) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	if _, ok := all[name]; !ok {
		return ErrAgentNotFound
	}
	delete(all, name)
	return s.writeLocked(all)
}

// ----------------------------------------------------------------------
// MCPStore
// ----------------------------------------------------------------------

type MCPStore struct {
	mu   sync.RWMutex
	path string
}

func NewMCPStore() (*MCPStore, error) {
	if err := config.EnsureDirs(); err != nil {
		return nil, err
	}
	return &MCPStore{path: filepath.Join(config.AppHome(), "mcp.json")}, nil
}

func (s *MCPStore) loadLocked() (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *MCPStore) writeLocked(all map[string]map[string]any) error {
	b, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// All returns the entire MCP catalogue (name → config). Used both by the
// API handlers and by session startup to merge global config.
func (s *MCPStore) All() (map[string]map[string]any, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadLocked()
}

func (s *MCPStore) Save(name string, cfg map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	all[name] = cfg
	return s.writeLocked(all)
}

func (s *MCPStore) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	if _, ok := all[name]; !ok {
		return ErrMCPNotFound
	}
	delete(all, name)
	return s.writeLocked(all)
}
