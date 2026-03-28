with open("games.js", "r") as f:
    content = f.read()

content = content.replace("export { fetchGames };\n\nimport { addDoc } from \"https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js\";", "import { addDoc } from \"https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js\";")
content = content.replace("export { postGame };", "export { fetchGames, postGame };")

with open("games.js", "w") as f:
    f.write(content)
