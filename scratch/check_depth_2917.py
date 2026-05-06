
import re

def check_balance(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    depth = 0
    for i, line in enumerate(lines):
        if i + 1 == 2917:
            print(f"Depth at line 2917: {depth}")
            break
        opens = len(re.findall(r'<div', line))
        closes = len(re.findall(r'</div>', line))
        depth += opens
        depth -= closes

check_balance('src/app/admin/admin-dashboard/admin-dashboard.component.html')
