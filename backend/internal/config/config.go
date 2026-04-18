// Package config holds compile-time defaults and runtime paths for copilot-buddy.
package config

import (
	"os"
	"path/filepath"
)

// AppName is the directory name under $HOME where state lives.
const AppName = "copilot-buddy"

// API path prefix for HTTP routes (mirrors copilot-console).
const APIPrefix = "/api"

// DefaultModel for new sessions when the caller doesn't specify one.
const DefaultModel = "gpt-4.1"

// DefaultPort for the local daemon HTTP listener.
const DefaultPort = 8770

// IdleSessionTTL is how long an SDK client may sit unused before the
// CopilotService GC tears it down.
const IdleSessionTTLMinutes = 10

// ResponseBufferTTL is how long a completed ResponseBuffer is kept in
// memory so a reconnecting client can resume.
const ResponseBufferTTLMinutes = 5

// AppHome returns the per-user state directory, honouring $COPILOT_BUDDY_HOME.
func AppHome() string {
	if v := os.Getenv("COPILOT_BUDDY_HOME"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, "."+AppName)
}

// SessionsDir holds per-session JSON metadata files.
func SessionsDir() string { return filepath.Join(AppHome(), "sessions") }

// SettingsFile is the global settings JSON file.
func SettingsFile() string { return filepath.Join(AppHome(), "settings.json") }

// EnsureDirs creates required directories on first run.
func EnsureDirs() error {
	for _, d := range []string{AppHome(), SessionsDir()} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	return nil
}

// DefaultCWD is the working directory used when a session is created
// without one.
func DefaultCWD() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}
