import math, struct

def create_emerald_gif(filename):
    width = 120
    height = 120
    num_frames = 20
    
    # Color palette (256 colors max, RGB)
    # 0: Black/Transparent dark background #0a0a0f
    # 1-32: Dark greens to vibrant lime emerald greens to glowing cyan/white
    palette = []
    palette.extend([10, 10, 15]) # 0: Dark bg
    
    # Generate green gradient palette
    for i in range(1, 256):
        t = i / 255.0
        r = int(min(255, max(0, t * 180 - 50)))
        g = int(min(255, t * 255 + 20))
        b = int(min(255, max(0, t * 200 - 30)))
        palette.extend([r, g, b])
        
    # Ensure palette length is 256 * 3 = 768 bytes
    while len(palette) < 768:
        palette.extend([0, 0, 0])

    frames_data = []

    # Facet points of an octagon emerald cut
    center_x, center_y = width / 2, height / 2
    
    for frame in range(num_frames):
        angle = (frame / num_frames) * 2 * math.pi
        pulse = (math.sin(angle) + 1) / 2 # 0 to 1
        
        # Pixels array for this frame
        pixels = [0] * (width * height)
        
        # Draw background glow ring
        for y in range(height):
            for x in range(width):
                dx = x - center_x
                dy = y - center_y
                dist = math.sqrt(dx*dx + dy*dy)
                
                # Outer glowing aura ring
                aura_radius = 42 + pulse * 6
                if abs(dist - aura_radius) < 8:
                    intensity = int((1 - abs(dist - aura_radius) / 8) * (80 + pulse * 100))
                    pixels[y * width + x] = max(pixels[y * width + x], intensity)
                
                # Emerald gem body octagon shape
                # Rotated gem cut
                cos_a = math.cos(angle * 0.5)
                sin_a = math.sin(angle * 0.5)
                
                rx = dx * cos_a - dy * sin_a
                ry = dx * sin_a + dy * cos_a
                
                # Octagon boundary
                gem_size = 28
                if abs(rx) < gem_size and abs(ry) < gem_size and (abs(rx) + abs(ry)) < gem_size * 1.35:
                    # Facet reflection math
                    facet_light = math.sin((rx * 0.1) + (ry * 0.1) + angle) * 40 + 160
                    # Highlight center table facet
                    if abs(rx) < gem_size * 0.5 and abs(ry) < gem_size * 0.5:
                        facet_light += 50 + pulse * 40
                    
                    c_idx = int(min(255, max(30, facet_light)))
                    pixels[y * width + x] = c_idx

        frames_data.append(pixels)

    # Write GIF89a file format directly
    with open(filename, 'wb') as f:
        # Header
        f.write(b'GIF89a')
        # Logical Screen Descriptor
        f.write(struct.pack('<HH', width, height))
        f.write(bytes([0xF7, 0, 0])) # Global Color Table Flag (256 colors)
        # Global Color Table
        f.write(bytes(palette))

        # Netscape Application Extension for looping forever
        f.write(b'\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00')

        # Frame Data
        for frame_idx, pixels in enumerate(frames_data):
            # Graphics Control Extension
            f.write(b'\x21\xF9\x04\x04\x05\x00\x00\x00') # 5/100ths sec delay = 20 fps
            # Image Descriptor
            f.write(b'\x2C')
            f.write(struct.pack('<HHHH', 0, 0, width, height))
            f.write(bytes([0x00])) # No local color table
            
            # LZW uncompressed min code size 8
            min_code_size = 8
            f.write(bytes([min_code_size]))
            
            # Simple LZW raster encoding
            # We can use plain LZW raster encoding
            # For simplicity, uncompressed LZW codes
            # Clear Code = 256, End Code = 257
            clear_code = 256
            end_code = 257
            
            # Pack 9-bit codes into sub-blocks
            codes = [clear_code] + pixels + [end_code]
            
            # Pack codes into bytes
            bit_buf = 0
            bit_cnt = 0
            byte_buf = bytearray()
            sub_blocks = bytearray()

            for code in codes:
                bit_buf |= (code << bit_cnt)
                bit_cnt += 9
                while bit_cnt >= 8:
                    byte_buf.append(bit_buf & 0xFF)
                    bit_buf >>= 8
                    bit_cnt -= 8
            if bit_cnt > 0:
                byte_buf.append(bit_buf & 0xFF)

            # Split byte_buf into <= 255 byte sub-blocks
            i = 0
            while i < len(byte_buf):
                chunk = byte_buf[i:i+254]
                sub_blocks.append(len(chunk))
                sub_blocks.extend(chunk)
                i += len(chunk)
            sub_blocks.append(0) # Block Terminator

            f.write(sub_blocks)

        f.write(b'\x3B') # GIF Trailer
    print("Created GIF successfully:", filename)

create_emerald_gif("src/assets/images/emerals_badge.gif")
