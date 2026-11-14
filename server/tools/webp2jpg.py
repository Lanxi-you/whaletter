"""把图库里的 webp 转成 jpg：手机上的 Image 组件对 webp 不一定认，
空白多半就卡在这儿。转完重新生成索引，App 拉新的就行。
"""
import os

from PIL import Image

SRC = os.path.expanduser(r"~\.dsh\meme-packs\dsh-meme-user")
OUT = r"C:\lanxi\lanxi-chat-plugin\public\memes"

os.makedirs(OUT, exist_ok=True)

n_ok = 0
n_skip = 0
for f in sorted(os.listdir(SRC)):
    low = f.lower()
    if not low.endswith(('.webp', '.png', '.jpeg', '.jpg')):
        continue
    src = os.path.join(SRC, f)
    base = os.path.splitext(f)[0]
    dest = os.path.join(OUT, base + '.jpg')
    if os.path.exists(dest):
        n_skip += 1
        continue
    try:
        im = Image.open(src)
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA')
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        # 太大就缩一档，手机上 512 足够
        if max(im.size) > 640:
            im.thumbnail((640, 640), Image.LANCZOS)
        im.save(dest, 'JPEG', quality=88, optimize=True, progressive=True)
        n_ok += 1
    except Exception as e:
        print('转换失败', f, e)

print(f'转好 {n_ok} 张，跳过已有的 {n_skip} 张')
