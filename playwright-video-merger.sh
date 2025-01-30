#!/bin/bash

# Define directories
VIDEO_DIR="test-results"
OUTPUT_DIR="processed_videos"
CONCAT_FILE="file_list.txt"
FINAL_OUTPUT="final_output.mp4"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Clean up old files
rm -f "$OUTPUT_DIR"/*.mp4 "$CONCAT_FILE"

echo "Processing Playwright test videos..."

# Loop through test result folders
find "$VIDEO_DIR" -type f -name "video.webm" | while read -r file; do
    # Extract test name from parent folder
    test_name=$(basename "$(dirname "$file")")
    test_name_clean=$(echo "$test_name" | sed 's/-/ /g')  # Replace dashes with spaces for readability

    # Define output file
    output_file="$OUTPUT_DIR/$test_name.mp4"

    echo "Adding overlay: $test_name_clean to $file"

    # Convert webm to mp4 and overlay text at the bottom
    ffmpeg -i "$file" -vf "drawtext=text='$test_name_clean':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=h-text_h-30:box=1:boxcolor=black@0.5:boxborderw=5" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k "$output_file" -y

    # Add to concat list
    echo "file '$output_file'" >> "$CONCAT_FILE"
done

echo "Concatenating videos..."

# Merge all processed videos
ffmpeg -f concat -safe 0 -i "$CONCAT_FILE" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k "$FINAL_OUTPUT" -y

echo "Done! Final video saved as: $FINAL_OUTPUT"
