"""Resize the brand logo into small favicons. Pure stdlib (no PIL)."""
import struct, zlib, os

SRC = r"C:\Users\cesar\code\agora-scout\frontend\public\logo.png"
OUTDIR = r"C:\Users\cesar\code\agora-scout\frontend\public"


def decode_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8; W = H = ct = 0; idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos+4])[0]; typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b"IHDR": W, H, _bd, ct = struct.unpack(">IIBB", chunk[:10])
        elif typ == b"IDAT": idat += chunk
        elif typ == b"IEND": break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]; stride = W * ch

    def paeth(a, b, c):
        p = a + b - c; pa = abs(p-a); pb = abs(p-b); pc = abs(p-c)
        return a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)

    out = bytearray(); prev = bytearray(stride); i = 0
    for _y in range(H):
        f = raw[i]; i += 1; line = bytearray(raw[i:i+stride]); i += stride
        for x in range(stride):
            a = line[x-ch] if x >= ch else 0; b = prev[x]; c = prev[x-ch] if x >= ch else 0
            if f == 1: line[x] = (line[x]+a) & 255
            elif f == 2: line[x] = (line[x]+b) & 255
            elif f == 3: line[x] = (line[x]+((a+b) >> 1)) & 255
            elif f == 4: line[x] = (line[x]+paeth(a, b, c)) & 255
        out += line; prev = line
    # normalize to RGBA
    rgba = bytearray(W*H*4)
    for p in range(W*H):
        s = p*ch
        if ch == 4: rgba[p*4:p*4+4] = out[s:s+4]
        elif ch == 3: rgba[p*4:p*4+3] = out[s:s+3]; rgba[p*4+3] = 255
        else: v = out[s]; rgba[p*4:p*4+3] = bytes([v, v, v]); rgba[p*4+3] = 255
    return W, H, bytes(rgba)


def box_resize(src, sw, sh, tw, th):
    out = bytearray(tw*th*4)
    for ty in range(th):
        y0 = ty*sh//th; y1 = max(y0+1, (ty+1)*sh//th)
        for tx in range(tw):
            x0 = tx*sw//tw; x1 = max(x0+1, (tx+1)*sw//tw)
            r = g = b = a = cnt = 0
            for yy in range(y0, y1):
                base = (yy*sw+x0)*4
                for xx in range(x1-x0):
                    p = base+xx*4
                    r += src[p]; g += src[p+1]; b += src[p+2]; a += src[p+3]; cnt += 1
            o = (ty*tw+tx)*4
            out[o] = r//cnt; out[o+1] = g//cnt; out[o+2] = b//cnt; out[o+3] = a//cnt
    return bytes(out)


def encode_png(path, w, h, rgba):
    raw = bytearray(); stride = w*4
    for y in range(h):
        raw.append(0); raw += rgba[y*stride:(y+1)*stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, d):
        return struct.pack(">I", len(d)) + typ + d + struct.pack(">I", zlib.crc32(typ+d) & 0xffffffff)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


W, H, rgba = decode_png(SRC)
for size in (32, 64, 180):
    small = box_resize(rgba, W, H, size, size)
    out = os.path.join(OUTDIR, f"favicon-{size}.png")
    encode_png(out, size, size, small)
    print(f"wrote {out}  ({os.path.getsize(out)} bytes)")
