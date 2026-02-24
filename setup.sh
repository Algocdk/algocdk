#!/bin/bash
# Go local environment setup and gopls install (no sudo needed)

# 1️⃣ Set GOPATH and GOMODCACHE to your home directory
export GOPATH=$HOME/go
export GOMODCACHE=$GOPATH/pkg/mod
export PATH=$GOPATH/bin:$PATH

# 2️⃣ Persist settings in ~/.bashrc if not already added
grep -qxF 'export GOPATH=$HOME/go' ~/.bashrc || echo 'export GOPATH=$HOME/go' >> ~/.bashrc
grep -qxF 'export GOMODCACHE=$GOPATH/pkg/mod' ~/.bashrc || echo 'export GOMODCACHE=$GOPATH/pkg/mod' >> ~/.bashrc
grep -qxF 'export PATH=$GOPATH/bin:$PATH' ~/.bashrc || echo 'export PATH=$GOPATH/bin:$PATH' >> ~/.bashrc

# 3️⃣ Create necessary directories
mkdir -p $GOPATH/bin
mkdir -p $GOMODCACHE

# 4️⃣ Install gopls
go install golang.org/x/tools/gopls@latest

# 5️⃣ Verify installation
echo "gopls location: $(which gopls)"
gopls version