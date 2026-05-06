import sys
import re

def find_unclosed(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines):
        # Find all tags in order
        tags = re.finditer(r'<(/?div|main|/main|header|/header|aside|/aside|nav|/nav|section|/section|form|/form)', line)
        for match in tags:
            tag = match.group(0)
            if tag.startswith('</'):
                tag_name = tag[2:]
                if stack and stack[-1][0] == tag_name:
                    stack.pop()
                else:
                    # print(f"Unexpected closing tag {tag} at line {i+1}")
                    pass
            elif not tag.endswith('/'): # Ignore self-closing if any (not standard for these but just in case)
                # Check for start of tag name
                match_name = re.match(r'<(\w+)', tag)
                if match_name:
                    tag_name = match_name.group(1)
                    stack.append((tag_name, i+1))
    
    print(f"Unclosed tags in {filename}:")
    for tag_name, line_num in stack:
        print(f"<{tag_name}> at line {line_num}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        find_unclosed(sys.argv[1])
    else:
        find_unclosed('src/app/admin/admin-dashboard/admin-dashboard.component.html')
