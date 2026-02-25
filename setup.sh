#!/bin/bash
# Go local environment setup and gopls install (no sudo needed)
# Works even if /etc/profile.d/go_env.sh exists

set -e

echo "🔧 Configuring Go environment..."

# 0️⃣ Remove any system-level overrides for this session
unset GOMODCACHE
unset GOPATH

# 1️⃣ Force Go to use your home directory (permanent fix)
go env -w GOPATH="$HOME/go"
go env -w GOMODCACHE="$HOME/go/pkg/mod"

# 2️⃣ Ensure PATH is correct for this session
export PATH="$HOME/go/bin:$PATH"

# 3️⃣ Persist PATH in ~/.bashrc (only if missing)
if ! grep -qxF 'export PATH=$HOME/go/bin:$PATH' ~/.bashrc; then
    echo 'export PATH=$HOME/go/bin:$PATH' >> ~/.bashrc
fi

# 4️⃣ Create necessary directories
mkdir -p "$HOME/go/bin"
mkdir -p "$HOME/go/pkg/mod"

# 5️⃣ Install gopls (language server)
echo "📦 Installing gopls..."
go install golang.org/x/tools/gopls@latest

# 6️⃣ Verify configuration
echo "----------------------------------"
echo "GOPATH:     $(go env GOPATH)"
echo "GOMODCACHE: $(go env GOMODCACHE)"
echo "gopls location: $(which gopls)"
gopls version
echo "✅ Setup complete."