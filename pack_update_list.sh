#!/bin/bash

# Output file
OUTPUT_FILE="update_list_transfer.zip"

echo "📦 Packing Update List System files..."

# Check if zip is installed
if ! command -v zip &> /dev/null; then
    echo "❌ query 'zip' could not be found. Please install zip."
    exit 1
fi

# Create the archive
zip -r $OUTPUT_FILE \
    src/app/update-list \
    src/app/api/updates \
    src/lib/supabase.ts \
    src/lib/utils.ts

echo "✅ Created $OUTPUT_FILE"
echo "📝 Move this file to your new project and run: unzip $OUTPUT_FILE"
