import os
import subprocess

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#4F46E5"/>
  <text x="50" y="67" 
        font-family="Arial, sans-serif" 
        font-size="52" 
        font-weight="bold"
        fill="white" 
        text-anchor="middle">V</text>
</svg>'''

sizes = [16, 32, 48, 128]
output_dir = "./icons"
os.makedirs(output_dir, exist_ok=True)

# SVG temporär speichern
svg_path = os.path.join(output_dir, "temp.svg")

with open(svg_path, "w") as f:
    f.write(svg)

for size in sizes:
    output_path = f"{output_dir}/icon{size}.png"

    subprocess.run([
        "resvg",
        svg_path,
        output_path,
        "--width", str(size),
        "--height", str(size)
    ], check=True)

    print(f"icon{size}.png created")

os.remove(svg_path)

print("finished!")