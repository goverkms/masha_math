from PIL import Image
import os

def remove_white_background(input_path, output_path, tolerance=200):
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # item is (r, g, b, a)
            # Check if pixel is close to white
            if item[0] > tolerance and item[1] > tolerance and item[2] > tolerance:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Successfully saved transparent image to {output_path}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Source image path (from artifacts)
    source_image = r"C:\Users\ajbel\.gemini\antigravity\brain\41c3e03a-80cd-4e0e-a749-ecf75f7814b0\masha_character_tablet_1771333842612.png"
    # Destination path
    output_image = r"c:\cursor_repo\masha_math\masha_character.png"
    
    if os.path.exists(source_image):
        remove_white_background(source_image, output_image)
    else:
        print(f"Source file not found: {source_image}")
