with open("games.js", "r") as f:
    lines = f.readlines()

new_lines = []
imports = []
code = []

for line in lines:
    if line.startswith("import"):
        imports.append(line)
    elif line.strip():
        code.append(line)

final_content = "".join(imports) + "\n" + "".join(code)

with open("games.js", "w") as f:
    f.write(final_content)
