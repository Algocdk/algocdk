#!/bin/bash

# Screen Sharing Feature - Verification Script
# This script verifies that all components are properly installed

echo "🎥 Screen Sharing Feature - Verification Script"
echo "================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counter
CHECKS_PASSED=0
CHECKS_FAILED=0

# Function to check file existence
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $2 - File not found: $1"
        ((CHECKS_FAILED++))
    fi
}

# Function to check if string exists in file
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $3"
        ((CHECKS_FAILED++))
    fi
}

echo "📁 Checking Backend Files..."
echo "----------------------------"
check_file "internal/models/screenshare.go" "Screen share models"
check_file "internal/handlers/screensharehandler.go" "Screen share handler"
check_content "internal/routes/routes.go" "screenshare" "Routes configuration"
check_content "internal/database/database.go" "ScreenShareSession" "Database migrations"
echo ""

echo "🌐 Checking Frontend Files..."
echo "-----------------------------"
check_file "frontend/screenshare-admin.html" "Admin HTML interface"
check_file "frontend/screenshare-admin.js" "Admin JavaScript"
check_file "frontend/screenshare-viewer.html" "Viewer HTML interface"
check_file "frontend/screenshare-viewer.js" "Viewer JavaScript"
echo ""

echo "📚 Checking Documentation..."
echo "---------------------------"
check_file "SCREENSHARE_FEATURE.md" "Feature documentation"
check_file "SCREENSHARE_SETUP.md" "Setup guide"
check_file "SCREENSHARE_INTEGRATION_CHECKLIST.md" "Integration checklist"
check_file "SCREENSHARE_ARCHITECTURE.md" "Architecture documentation"
check_file "README_SCREENSHARE.md" "README"
echo ""

echo "🔧 Checking Dependencies..."
echo "--------------------------"
check_content "go.mod" "gorilla/websocket" "WebSocket library"
echo ""

echo "🏗️  Testing Build..."
echo "-------------------"
if go build -o algocdk_test main.go 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Application builds successfully"
    ((CHECKS_PASSED++))
    rm -f algocdk_test
else
    echo -e "${RED}✗${NC} Build failed - check for compilation errors"
    ((CHECKS_FAILED++))
fi
echo ""

echo "📊 Verification Summary"
echo "======================="
echo -e "Checks Passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks Failed: ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Screen sharing feature is properly installed.${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "1. Run the application: ./algocdk"
    echo "2. Admin interface: http://localhost:3000/screenshare-admin"
    echo "3. Viewer interface: http://localhost:3000/screenshare-viewer"
    echo "4. Read SCREENSHARE_SETUP.md for detailed setup instructions"
else
    echo -e "${RED}❌ Some checks failed. Please review the errors above.${NC}"
    echo ""
    echo "💡 Troubleshooting:"
    echo "1. Ensure all files were created properly"
    echo "2. Check for any compilation errors"
    echo "3. Review SCREENSHARE_SETUP.md for help"
fi

echo ""
echo "📖 Documentation Files:"
echo "  - SCREENSHARE_FEATURE.md (Complete documentation)"
echo "  - SCREENSHARE_SETUP.md (Quick setup guide)"
echo "  - SCREENSHARE_INTEGRATION_CHECKLIST.md (Integration steps)"
echo "  - SCREENSHARE_ARCHITECTURE.md (Architecture diagrams)"
echo "  - README_SCREENSHARE.md (Overview)"
echo ""

exit $CHECKS_FAILED
