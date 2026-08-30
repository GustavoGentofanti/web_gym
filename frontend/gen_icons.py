import os, struct, zlib
os.makedirs('icons', exist_ok=True)

def make_png(path, width, height, bg=(13,17,23), accent=(34,197,94)):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            cx = width / 2
            cy = height / 2
            dist = (x - cx) ** 2 + (y - cy) ** 2
            outer = (min(width, height) * 0.35) ** 2
            inner = (min(width, height) * 0.18) ** 2
            if dist < outer:
                r, g, b = (255, 255, 255)
            else:
                r, g, b = bg
            if dist < inner:
                r, g, b = accent
            rows.extend((r, g, b, 255))

    def chunk(tag, data):
        return struct.pack('!I', len(data)) + tag + data + struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('!IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(rows), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

make_png('icons/icon-192.png', 192, 192)
make_png('icons/icon-512.png', 512, 512)
print('created')
