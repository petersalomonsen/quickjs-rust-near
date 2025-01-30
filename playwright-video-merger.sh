#!/bin/bash

# Define directories
VIDEO_DIR="test-results"
OUTPUT_DIR="processed_videos"
FREEZE_FRAMES_DIR="freeze_frames"
CONCAT_FILE="file_list.txt"
FINAL_OUTPUT="final_output.mp4"
TEXT_WRAP_LIMIT=40  # Adjust this limit based on your video width

# Ensure output directories exist
mkdir -p "$OUTPUT_DIR" "$FREEZE_FRAMES_DIR"

# Clean up old files
rm -f "$OUTPUT_DIR"/*.mp4 "$FREEZE_FRAMES_DIR"/*.mp4 "$CONCAT_FILE"

echo "Processing Playwright test videos with a 1-second delay and wrapped subtitles..."

# Find and process all video files
find "$VIDEO_DIR" -type f -name "video.webm" | while read -r file; do
    # Get the parent folder name as the test name
    test_name=$(basename "$(dirname "$file")")
    
    # Format name: Replace dashes with spaces
    test_name_clean=$(echo "$test_name" | sed 's/-/ /g')

    # Wrap text if it's too long (insert a line break at the closest space)
    if [[ ${#test_name_clean} -gt $TEXT_WRAP_LIMIT ]]; then
        test_name_clean=$(echo "$test_name_clean" | sed -E "s/(.{1,$TEXT_WRAP_LIMIT}) /\1\n/")
    fi

    # Define output filenames
    output_file="$OUTPUT_DIR/$test_name.mp4"
    freeze_frame_file="$FREEZE_FRAMES_DIR/${test_name}_freeze.mp4"

    echo "Processing: $file"
    echo "Overlaying test name (wrapped): '$test_name_clean'"

    # Convert webm to mp4 and overlay wrapped text at the bottom
    ffmpeg -i "$file" -vf "drawtext=text='$test_name_clean':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=h-text_h-30:box=1:boxcolor=black@0.5:boxborderw=5:line_spacing=10" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k "$output_file" -y

    # Extract last frame and create a 1-second freeze frame
    echo "Generating 1-second freeze frame..."
    ffmpeg -sseof -0.1 -i "$output_file" -vframes 1 -q:v 2 "$FREEZE_FRAMES_DIR/${test_name}.jpg" -y
    ffmpeg -loop 1 -t 1 -i "$FREEZE_FRAMES_DIR/${test_name}.jpg" -vf "scale=1280:-2" -c:v libx264 -crf 23 -preset fast -tune stillimage -pix_fmt yuv420p "$freeze_frame_file" -y

    # Add both files to the concat list
    echo "file '$output_file'" >> "$CONCAT_FILE"
    echo "file '$freeze_frame_file'" >> "$CONCAT_FILE"
done

# Check if there are videos to concatenate
if [[ -s "$CONCAT_FILE" ]]; then
    echo "Concatenating all processed videos with delays..."

    ffmpeg -f concat -safe 0 -i "$CONCAT_FILE" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k "$FINAL_OUTPUT" -y

    echo "✅ Done! Final video saved as: $FINAL_OUTPUT"
else
    echo "❌ No valid videos found to concatenate!" >&2
fi
