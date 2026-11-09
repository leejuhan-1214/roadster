"""Create lightweight runtime maps from Poly Haven Tree Small 02 CC0 originals.

python scripts/prepare-city-tree-textures.py SOURCE_DIRECTORY
Run from the repository root after prepare-city-tree.mjs.
"""
from pathlib import Path
import sys
from PIL import Image

source = Path(sys.argv[1]) / 'textures'
out = Path('dist/assets/trees')
out.mkdir(parents=True, exist_ok=True)
for original, name in [
    ('branch_diff', 'branch-diff'), ('diff', 'trunk-diff'),
    ('branch_nor_gl', 'branch-normal'), ('nor_gl', 'trunk-normal'),
]:
    image = Image.open(source / f'tree_small_02_{original}_1k.jpg').convert('RGB')
    image.save(out / f'{name}.jpg', quality=86, optimize=True)
leaves = Image.open(source / 'tree_small_02_leaves_diff_1k.jpg').convert('RGBA')
alpha = Image.open(source / 'tree_small_02_leaves_alpha_1k.png').convert('L')
leaves.putalpha(alpha)
leaves.save(out / 'leaves-rgba.png', optimize=True)
