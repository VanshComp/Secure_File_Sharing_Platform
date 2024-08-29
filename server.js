require("dotenv").config();
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const File = require("./models/File");

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads" });

mongoose.connect(process.env.DATABASE_URL);

app.set("view engine", "ejs");

// Define a session-like object to store attempts per file per user
let attempts = {};

app.get("/", (req, res) => {
  res.render("index");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const fileData = {
    path: req.file.path,
    originalName: req.file.originalname,
    expiryDate: new Date(req.body.expiryDate),
  };
  if (req.body.password != null && req.body.password !== "") {
    fileData.password = await bcrypt.hash(req.body.password, 10);
  }

  const file = await File.create(fileData);

  res.render("index", { fileLink: `${req.headers.origin}/file/${file.id}` });
});

app.route("/file/:id").get(handleDownload).post(handleDownload);

async function handleDownload(req, res) {
  const file = await File.findById(req.params.id);

  if (!file) {
    res.status(404).send("File not found");
    return;
  }

  const currentTime = new Date();
  const timeRemaining = file.expiryDate - currentTime;

  if (file.expiryDate && timeRemaining <= 0) {
    res.render("password", { expired: true });
    return;
  }

  const fileId = file.id;

  // Initialize attempts for this file if not already done
  if (!attempts[fileId]) {
    attempts[fileId] = 5;
  }

  if (file.password != null) {
    if (req.body.password == null) {
      res.render("password", { file, timeRemaining, attemptsLeft: attempts[fileId] });
      return;
    }

    if (!(await bcrypt.compare(req.body.password, file.password))) {
      attempts[fileId]--;

      if (attempts[fileId] <= 0) {
        res.render("password", { attemptsLeft: 0, file, timeRemaining });
        return;
      }

      res.render("password", { error: true, file, timeRemaining, attemptsLeft: attempts[fileId] });
      return;
    }
  }

  // Reset attempts after successful download
  attempts[fileId] = 5;

  file.downloadCount++;
  await file.save();
  console.log(file.downloadCount);

  res.download(file.path, file.originalName);
}

app.listen(process.env.PORT);
