
import re

def check_balance(filename, start_line, end_line):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    depth = 0
    for i in range(start_line - 1, end_line):
        line = lines[i]
        opens = len(re.findall(r'<div', line))
        closes = len(re.findall(r'</div>', line))
        old_depth = depth
        depth += opens
        depth -= closes
        if depth != old_depth:
            # print(f"Line {i+1}: Depth {depth}")
            pass
    return depth

print(f"Form depth change: {check_balance('src/app/admin/admin-dashboard/admin-dashboard.component.html', 1183, 1505)}")
print(f"Orders depth change: {check_balance('src/app/admin/admin-dashboard/admin-dashboard.component.html', 2088, 2440)}")
