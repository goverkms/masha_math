from PIL import Image
import os
import collections

def remove_background_flood_fill(input_path, output_path, tolerance=200):
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        pixels = img.load()

        # Helper to check if a pixel is "white-ish"
        def is_white(r, g, b):
            return r > tolerance and g > tolerance and b > tolerance

        # BFS for flood fill
        visited = set()
        queue = collections.deque()

        # Start from corners (assuming background touches at least one corner)
        corners = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
        for x, y in corners:
            r, g, b, a = pixels[x, y]
            if is_white(r, g, b):
                queue.append((x, y))
                visited.add((x, y))

        # Directions: 4-connectivity
        dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]

        processed_count = 0
        while queue:
            x, y = queue.popleft()
            
            # Get current pixel color
            r, g, b, a = pixels[x, y]
            
            # Set to transparent
            pixels[x, y] = (255, 255, 255, 0)
            processed_count += 1

            for dx, dy in dirs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        # Check neighbors
                        nr, ng, nb, na = pixels[nx, ny]
                        if is_white(nr, ng, nb):
                            visited.add((nx, ny))
                            queue.append((nx, ny))

        print(f"Processed {processed_count} background pixels. Internal whites preserved.")
        img.save(output_path, "PNG")
        print(f"Successfully saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Source image path
    source_image = r"c:\cursor_repo\masha_math\fairy_patrol_group.png"
    # Destination path
    output_image = r"c:\cursor_repo\masha_math\fairy_patrol_group_clean.png"
    
    if os.path.exists(source_image):
        remove_background_flood_fill(source_image, output_image)
    else:
        print(f"Source file not found: {source_image}")
