CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`storagePath` text NOT NULL,
	`storageUrl` text,
	`mimeType` varchar(64) DEFAULT 'image/jpeg',
	`fileSizeBytes` int,
	`status` enum('pending','processing','needs_review','reviewed','flagged','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`documentId` int,
	`type` enum('transcribe','batch_transcribe','validate_config') NOT NULL,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`progress` int DEFAULT 0,
	`totalItems` int DEFAULT 1,
	`completedItems` int DEFAULT 0,
	`errorMessage` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `onboarding_samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`imagePath` text NOT NULL,
	`imageUrl` text,
	`filename` varchar(255),
	`manualTranscription` json NOT NULL,
	`aiOutput` json,
	`validationScore` float,
	`isHeldOut` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onboarding_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('onboarding','validating','active','archived') NOT NULL DEFAULT 'onboarding',
	`modelProvider` varchar(64) NOT NULL DEFAULT 'gemini',
	`modelName` varchar(128) NOT NULL DEFAULT 'gemini-2.5-flash',
	`pipelineType` enum('single_pass','two_pass') NOT NULL DEFAULT 'single_pass',
	`temperature` float NOT NULL DEFAULT 0.1,
	`maxTokens` int NOT NULL DEFAULT 4096,
	`systemPrompt` text,
	`pass2Prompt` text,
	`jsonSchema` json,
	`glossary` json,
	`postProcessing` json,
	`outputFormats` json,
	`onboardingReasoning` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`projectId` int NOT NULL,
	`modelUsed` varchar(128) NOT NULL,
	`rawJson` json NOT NULL,
	`reviewedJson` json,
	`originalText` text,
	`confidenceNotes` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transcriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `onboarding_samples` ADD CONSTRAINT `onboarding_samples_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transcriptions` ADD CONSTRAINT `transcriptions_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transcriptions` ADD CONSTRAINT `transcriptions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `documents_projectId_idx` ON `documents` (`projectId`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_projectId_idx` ON `jobs` (`projectId`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `samples_projectId_idx` ON `onboarding_samples` (`projectId`);--> statement-breakpoint
CREATE INDEX `projects_userId_idx` ON `projects` (`userId`);--> statement-breakpoint
CREATE INDEX `transcriptions_documentId_idx` ON `transcriptions` (`documentId`);--> statement-breakpoint
CREATE INDEX `transcriptions_projectId_idx` ON `transcriptions` (`projectId`);