const fs = require("fs");
const path = require("path");

const logsDir = path.join(process.env.HOME, "var", "log");
let incompleteLastLine, incompleteFirstLine;

// Entry method for the logic
const getMatchedLogs = async (pattern, count, fileName, res) => {
  let shouldStopReading = false; // variable to determine when to stop reading - set to true once the count is reached
  let matchedLogs = []; // variable to store the matched logs
  incompleteLastLine = ""; // variable to store the incomplete last line
  incompleteFirstLine = ""; // variable to store incomplete last line

  return await processLogFile(
    pattern,
    count,
    fileName,
    res,
    matchedLogs,
    shouldStopReading
  );
};

// Method to process the chunk
const processStream = (
  start,
  end,
  pattern,
  count,
  res,
  matchedLogs,
  filePath,
  bufferSize
) => {
  return new Promise((resolve, reject) => {
    // Create a read stream for the chunk
    // initial will be from start - bufferSize till the fileSize
    // for the next iterations, start and end pointers will be modified
    const readStream = fs.createReadStream(filePath, {
      start,
      end,
      highWaterMark: bufferSize,
      encoding: "utf-8",
    });

    let data = "";

    // Read the chunk and once the matchLogs count
    // is satisfied, destroy the readStream and exit
    readStream.on("data", (chunk) => {
      if (count !== "" && !isNaN(count) && count == matchedLogs.length) {
        readStream.destroy();
        return true;
      } else {
        data += chunk;
      }
    });

    // This is called once a readStream is finished
    // If the readStream is destroyed, this won't get called
    readStream.on("end", () => {
      // Since we are reading in chunks, the first and last lines could be incomplete or not in proper format
      // In each iteration, we concat the current chunk with the previous value of incomplete line.
      // By doing so, that particular line will be complete for the next iteration
      const lines = (incompleteLastLine + data + incompleteFirstLine).split(
        "\n"
      );

      // Only take incomplete lines if it's not valid
      incompleteFirstLine = validateIncompleteLine(
        incompleteFirstLine,
        lines,
        true
      );
      incompleteLastLine = validateIncompleteLine(
        incompleteLastLine,
        lines,
        false
      );

      // Process the lines of each chunk
      const shouldStopReading = processLines(
        pattern,
        count,
        lines,
        matchedLogs
      );

      // If we got the required result, we can exit by returning the matchLogs in the
      // caller function
      if (shouldStopReading) {
        readStream.destroy();
        resolve(true);
      } else {
        resolve(false);
      }
    });

    readStream.on("error", (error) => {
      console.log(error);
      res.status(500).send({ Error: "Internal Server Error" });
      reject(error);
    });
  });
};

// Method to check if the incomplete line is valid or not
// This method will get called only once per chunk at maximum
const validateIncompleteLine = (incompleteLine, lines, isStart) => {
  try {
    // Here we check if the incomplete line (first or last)
    // is valid
    let resultLine = "";
    resultLine = isStart ? lines[0] : lines[lines.length - 1];
    if (resultLine) {
      JSON.parse(resultLine);
      return "";
    } else {
      return "";
    }
  } catch (err) {
    // if the line is incomplete return and set incompleteLine
    // as the first or last accordingly
    incompleteLine = isStart ? lines.shift() : lines.pop();
    return incompleteLine;
  }
};

const processLines = (pattern, count, lines, matchedLogs) => {
  // Loop through the lines of current chunk (128KB) from the last
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    try {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        const json = JSON.parse(line);
        matchedLogs.push(json);
        if (count !== "" && !isNaN(count) && count == matchedLogs.length) {
          // If count is reached return the flag
          // to notify no more chunk processing required
          return true;
        }
      }
    } catch (error) {
      //Incomplete line, continue and will be taken care in the next iteration
    }
  }
};

const getFileSize = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(stats.size);
      }
    });
  });
};

const processLogFile = async (
  pattern,
  count,
  fileName,
  res,
  matchedLogs,
  shouldStopReading
) => {
  try {
    const filePath = path.join(logsDir, fileName);

    const fileSize = await getFileSize(filePath);

    // Reading in chunks for efficiency and if file size is less than 128KB, we can directly load the whole file, else split into chunks of 128KB
    const bufferSize = Math.min(fileSize, 128 * 1024);

    // Initializing end pointer to filze size so we read the last chunk first
    let end = fileSize;

    // Continue reading until end of the file reached or if the desired count is reached
    while (end > 0 && !shouldStopReading) {
      // Initialize the start to end - buffer size, so that the last chunk is processed first
      const start = Math.max(0, (end - bufferSize) + 1);

      shouldStopReading = await processStream(
        start,
        end,
        pattern,
        count,
        res,
        matchedLogs,
        filePath,
        bufferSize
      );

      // Once a chunk is done processing, reinitialize end to start - 1
      end = start-1;
    }
    return matchedLogs;
  } catch (error) {
    if (
      error.code === "ENOENT" &&
      error.message.includes("no such file or directory")
    ) {
      res.status(404).send({ error: "File not found at " + error.path, code: "FILE_NOT_FOUND", filePath : error.path });
    } else {
      res.status(400).send({ error: "Error processing the files given" });
    }
  }
};

module.exports = { getMatchedLogs };
