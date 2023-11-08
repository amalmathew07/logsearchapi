const express = require("express");
const cors = require("cors");
const { getMatchedLogs } = require("./matchLogExtractor");
const AWS = require("aws-sdk");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 3000;
const s3 = new AWS.S3();

app.use(express.json());
app.use(cors());
app.get("/logs", async (req, res) => {
  const pattern = req.query.pattern;
  const count = req.query.count ? parseInt(req.query.count, 10) : "";
  const fileName = req.query.fileName;

  if (!pattern || !fileName || (count !== "" && (isNaN(count) || count <= 0))) {
    return res.status(400).json({
      error:
        "Invalid parameters. Please provide fileName, pattern and count (should be greater than 0) as query parameters.",
    });
  }
  const logs = await getMatchedLogs(pattern, count, fileName, res);
  res.status(200).send(logs);
});

const PDFDocument = require('pdfkit');

app.post("/generate-pdf", (req, res) => {
  // Create a PDF document
  const pdfDoc = new PDFDocument();

  // Create a buffer to store the PDF content
  const buffers = [];
  pdfDoc.on('data', buffers.push.bind(buffers));
  pdfDoc.on('end', () => {
    const pdfContent = Buffer.concat(buffers);

    const pdfFileName = `pdf-${uuidv4()}.pdf`;

    // Upload PDF to S3 root folder
    const params = {
      Bucket: "amal-log-bucket",
      Key: pdfFileName, // Adjust the Key parameter to specify the desired path in the bucket
      Body: pdfContent,
    };

    s3.upload(params, (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error uploading PDF to S3");
      }

      res.status(200).json({ message: "PDF uploaded to S3", data });
    });
  });

  // Write "Hello" to the PDF
  pdfDoc.text("Hello");

  // Finalize the PDF
  pdfDoc.end();
});


app.get("/get-pdf/:fileName", (req, res) => {
  const { fileName } = req.params;

  const params = {
    Bucket: "amal-log-bucket",
    Key: fileName,
  };

  s3.getObject(params, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error retrieving PDF from S3");
    }

    res.status(200).send(data.Body.toString());
  });
});

app.get("/", async (req, res) => {
  res.status(200).send("Success");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

module.exports = app;
