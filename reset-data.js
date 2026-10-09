const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "orbit-data.json");
if (fs.existsSync(file)) {
  fs.unlinkSync(file);
  console.log("Orbit data deleted. Restart the server with: npm start");
} else {
  console.log("Orbit data is already empty. Restart the server with: npm start");
}
