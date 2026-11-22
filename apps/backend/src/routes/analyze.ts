import { Router } from "express";

import { upload } from "../http/multer.js";
import { analyzeUploadedRepository } from "../application/repository-analysis.service.js";
import { progressService } from "../progress/progress.service.js";
import { logger } from "../logger/logger.service.js";

const router = Router();

router.post(
  "/analyze",
  upload.single("repository"),
  async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No ZIP file uploaded.",
      });
    }

    progressService.startNewAnalysis();

    try {
      await logger.startSession();

      await logger.info("Repository analysis started");

      const result = await analyzeUploadedRepository(
        req.file.path,
      );

      return res.status(200).json({
        success: true,
        report: result.report,
        markdown: result.markdown,
      });
    } catch (error) {
      await logger.error("Repository analysis failed", error);

      return next(error);
    }
  },
);

export default router;
