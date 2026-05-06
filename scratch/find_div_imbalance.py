
import re

def check_balance(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    depth = 0
    for i, line in enumerate(lines):
        # We need to process tags in order if they are on the same line
        # But for simplicity, we can just check if depth + opens >= closes
        opens = len(re.findall(r'<div([ >])', line))
        closes = len(re.findall(r'</div>', line))
        
        # Try to match pairs on the same line first
        # (Though technically a line could be </div><div>)
        # Let's just track the minimum depth during the line.
        
        current_depth = depth
        # For simplicity, let's assume all opens come before closes on a single line
        # unless it's a closing tag followed by an opening tag.
        # Most common is <div...>...</div>
        
        # A better way: find all occurrences and sort them
        tags = []
        for match in re.finditer(r'<div([ >])', line):
            tags.append((match.start(), 1))
        for match in re.finditer(r'</div>', line):
            tags.append((match.start(), -1))
        tags.sort()
        
        for pos, delta in tags:
            current_depth += delta
            if current_depth < 0:
                print(f"Extra closing div at line {i+1}, pos {pos}: {line.strip()}")
                current_depth = 0 # reset
        
        depth = current_depth

check_balance('src/app/admin/admin-dashboard/admin-dashboard.component.html')
