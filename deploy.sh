#!/bin/bash
# Deployment script for ioBroker.vis-2-widgets-nils-fork
# Deploys the widget to a remote Raspberry Pi running ioBroker

set -e  # Exit on error

# Configuration
REMOTE_HOST="192.168.178.40"
REMOTE_USER="pi"
REMOTE_IOBROKER_PATH="/opt/iobroker"
WIDGET_NAME="vis-2-widgets-nils-fork"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== ioBroker Widget Deployment Script ===${NC}"
echo -e "Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_IOBROKER_PATH}"
echo ""

# Step 1: Build the widget locally
echo -e "${YELLOW}Step 1: Building widget locally...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Build successful!${NC}"
echo ""

# Step 2: Create a tarball of the complete package (all files from package.json "files" array)
echo -e "${YELLOW}Step 2: Creating deployment package...${NC}"
# Create a temporary directory with the package structure
TEMP_DIR=$(mktemp -d)
cp -r admin "$TEMP_DIR/"
cp -r img "$TEMP_DIR/"
cp io-package.json "$TEMP_DIR/"
cp LICENSE "$TEMP_DIR/"
cp -r widgets "$TEMP_DIR/"
# Create package.json for the tarball (required by npm)
cat > "$TEMP_DIR/package.json" << EOF
{
  "name": "iobroker.${WIDGET_NAME}",
  "version": "$(cat package.json | grep '"version"' | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')",
  "description": "ioBroker vis2 widgets for Nils",
  "main": "widgets/vis-2-widgets-nils-fork/customWidgets.js",
  "files": [
    "admin/",
    "img/",
    "io-package.json",
    "LICENSE",
    "widgets/"
  ],
  "keywords": [
    "ioBroker",
    "vis-2",
    "widgets"
  ],
  "license": "MIT"
}
EOF
cd "$TEMP_DIR"
tar -czf "${OLDPWD}/${WIDGET_NAME}.tar.gz" .
cd "${OLDPWD}"
rm -rf "$TEMP_DIR"
echo -e "${GREEN}Package created: ${WIDGET_NAME}.tar.gz${NC}"
echo ""

# Step 3: Copy to Raspberry Pi
echo -e "${YELLOW}Step 3: Copying to Raspberry Pi...${NC}"
scp ${WIDGET_NAME}.tar.gz ${REMOTE_USER}@${REMOTE_HOST}:/tmp/

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to copy to Raspberry Pi!${NC}"
    exit 1
fi
echo -e "${GREEN}Copy successful!${NC}"
echo ""

# Step 4: Deploy on Raspberry Pi
echo -e "${YELLOW}Step 4: Deploying on Raspberry Pi...${NC}"
ssh ${REMOTE_USER}@${REMOTE_HOST} << EOF
    set -e
    cd ${REMOTE_IOBROKER_PATH}
    
    # Stop ioBroker if running (optional, but safer)
    # iobroker stop
    
    # Backup existing widget if it exists
    #if [ -d "node_modules/iobroker.${WIDGET_NAME}" ]; then
    #    echo "Backing up existing widget..."
    #    mv node_modules/iobroker.${WIDGET_NAME} node_modules/iobroker.${WIDGET_NAME}.backup.\$(date +%Y%m%d_%H%M%S)
    #fi
    echo "📦 Installing through ioBroker package installer..."

    cd '$REMOTE_IOBROKER_PATH'
    iobroker url '/tmp/${WIDGET_NAME}.tar.gz'

    # Extract new widget
    #echo "Extracting new widget..."
    #tar -xzf /tmp/${WIDGET_NAME}.tar.gz -C node_modules/
    
    # Clean up
    rm /tmp/${WIDGET_NAME}.tar.gz
    
    # Restart vis-2 so it discovers and uploads the widget bundle.
    iobroker restart vis-2
    iobroker message vis-2.0 rebuild
    iobroker upload vis-2-widgets-nils-fork --debug

    echo "Deployment complete on Raspberry Pi!"
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}Deployment on Raspberry Pi failed!${NC}"
    exit 1
fi

# Step 5: Clean up local tarball
rm ${WIDGET_NAME}.tar.gz

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo -e "Widget ${WIDGET_NAME} has been deployed to ${REMOTE_USER}@${REMOTE_HOST}"
echo ""
echo "Note: You may need to restart ioBroker on the Raspberry Pi for changes to take effect:"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'iobroker restart'"