// copilot-buddy: local daemon that bridges the Chrome extension to the
// GitHub Copilot CLI via github.com/github/copilot-sdk/go.
//
// Currently a stub. See plan.md (P3) for the HTTP/SSE work.
package main

import (
	"flag"
	"fmt"
	"log"
)

var version = "0.0.1-dev"

func main() {
	var (
		port = flag.Int("port", 8770, "HTTP listen port")
		host = flag.String("host", "127.0.0.1", "HTTP listen host")
	)
	flag.Parse()

	fmt.Printf("copilot-buddy v%s\n", version)
	fmt.Printf("listen %s:%d (TODO)\n", *host, *port)
	log.Println("daemon not yet implemented — see plan.md")
}
