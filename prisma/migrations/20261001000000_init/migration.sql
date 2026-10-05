-- CreateTable
CREATE TABLE "User" (
    "UserId" UUID NOT NULL,
    "Email" VARCHAR(255) NOT NULL,
    "Username" VARCHAR(100) NOT NULL,
    "PasswordHash" VARCHAR(100),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ModifiedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PK_User" PRIMARY KEY ("UserId")
);

-- CreateTable
CREATE TABLE "UserLogin" (
    "UserLoginId" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "Provider" VARCHAR(20) NOT NULL,
    "ProviderUserId" VARCHAR(255) NOT NULL,
    "CreatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_UserLogin" PRIMARY KEY ("UserLoginId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "TokenId" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "TokenHash" CHAR(64) NOT NULL,
    "FamilyId" UUID NOT NULL,
    "ExpiresAt" TIMESTAMP(3) NOT NULL,
    "RevokedAt" TIMESTAMP(3),
    "CreatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_RefreshToken" PRIMARY KEY ("TokenId")
);

-- CreateTable
CREATE TABLE "LibraryCard" (
    "CardId" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "Name" VARCHAR(100) NOT NULL,
    "Setup" VARCHAR(10) NOT NULL,
    "CreatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ModifiedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PK_LibraryCard" PRIMARY KEY ("CardId")
);

-- CreateTable
CREATE TABLE "CardFretboard" (
    "CardFretboardId" UUID NOT NULL,
    "CardId" UUID NOT NULL,
    "Position" INTEGER NOT NULL,
    "KeyName" VARCHAR(5) NOT NULL,
    "Accidental" VARCHAR(10) NOT NULL,
    "Tonality" VARCHAR(10) NOT NULL,
    "Pattern" VARCHAR(50) NOT NULL,
    "FretAmount" INTEGER NOT NULL,
    "ChordPosition" INTEGER NOT NULL,
    "ChordView" VARCHAR(10),
    "ShapeC" BOOLEAN NOT NULL,
    "ShapeA" BOOLEAN NOT NULL,
    "ShapeG" BOOLEAN NOT NULL,
    "ShapeE" BOOLEAN NOT NULL,
    "ShapeD" BOOLEAN NOT NULL,
    "StringLowE" BOOLEAN NOT NULL,
    "StringA" BOOLEAN NOT NULL,
    "StringD" BOOLEAN NOT NULL,
    "StringG" BOOLEAN NOT NULL,
    "StringB" BOOLEAN NOT NULL,
    "StringHighE" BOOLEAN NOT NULL,
    "HighlightNotes" VARCHAR(500) NOT NULL,

    CONSTRAINT "PK_CardFretboard" PRIMARY KEY ("CardFretboardId")
);

-- CreateTable
CREATE TABLE "WorkspaceFretboard" (
    "WorkspaceFretboardId" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "Setup" VARCHAR(10) NOT NULL,
    "Position" INTEGER NOT NULL,
    "KeyName" VARCHAR(5) NOT NULL,
    "Accidental" VARCHAR(10) NOT NULL,
    "Tonality" VARCHAR(10) NOT NULL,
    "Pattern" VARCHAR(50) NOT NULL,
    "FretAmount" INTEGER NOT NULL,
    "ChordPosition" INTEGER NOT NULL,
    "ChordView" VARCHAR(10),
    "ShapeC" BOOLEAN NOT NULL,
    "ShapeA" BOOLEAN NOT NULL,
    "ShapeG" BOOLEAN NOT NULL,
    "ShapeE" BOOLEAN NOT NULL,
    "ShapeD" BOOLEAN NOT NULL,
    "StringLowE" BOOLEAN NOT NULL,
    "StringA" BOOLEAN NOT NULL,
    "StringD" BOOLEAN NOT NULL,
    "StringG" BOOLEAN NOT NULL,
    "StringB" BOOLEAN NOT NULL,
    "StringHighE" BOOLEAN NOT NULL,
    "HighlightNotes" VARCHAR(500) NOT NULL,

    CONSTRAINT "PK_WorkspaceFretboard" PRIMARY KEY ("WorkspaceFretboardId")
);

-- CreateTable
CREATE TABLE "ChordProgression" (
    "UserId" UUID NOT NULL,
    "KeyName" VARCHAR(5) NOT NULL,
    "Tonality" VARCHAR(10) NOT NULL,
    "ModifiedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PK_ChordProgression" PRIMARY KEY ("UserId")
);

-- CreateTable
CREATE TABLE "ProgressionChord" (
    "ProgressionChordId" UUID NOT NULL,
    "UserId" UUID NOT NULL,
    "Position" INTEGER NOT NULL,
    "Degree" INTEGER NOT NULL,

    CONSTRAINT "PK_ProgressionChord" PRIMARY KEY ("ProgressionChordId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_User_Email" ON "User"("Email");

-- CreateIndex
CREATE INDEX "IX_UserLogin_UserId" ON "UserLogin"("UserId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_UserLogin_Provider_ProviderUserId" ON "UserLogin"("Provider", "ProviderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_RefreshToken_TokenHash" ON "RefreshToken"("TokenHash");

-- CreateIndex
CREATE INDEX "IX_RefreshToken_UserId" ON "RefreshToken"("UserId");

-- CreateIndex
CREATE INDEX "IX_RefreshToken_FamilyId" ON "RefreshToken"("FamilyId");

-- CreateIndex
CREATE INDEX "IX_LibraryCard_UserId_CreatedDate" ON "LibraryCard"("UserId", "CreatedDate");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_CardFretboard_CardId_Position" ON "CardFretboard"("CardId", "Position");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_WorkspaceFretboard_UserId_Setup_Position" ON "WorkspaceFretboard"("UserId", "Setup", "Position");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_ProgressionChord_UserId_Position" ON "ProgressionChord"("UserId", "Position");

-- AddForeignKey
ALTER TABLE "UserLogin" ADD CONSTRAINT "FK_UserLogin_User" FOREIGN KEY ("UserId") REFERENCES "User"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "FK_RefreshToken_User" FOREIGN KEY ("UserId") REFERENCES "User"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCard" ADD CONSTRAINT "FK_LibraryCard_User" FOREIGN KEY ("UserId") REFERENCES "User"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFretboard" ADD CONSTRAINT "FK_CardFretboard_LibraryCard" FOREIGN KEY ("CardId") REFERENCES "LibraryCard"("CardId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFretboard" ADD CONSTRAINT "FK_WorkspaceFretboard_User" FOREIGN KEY ("UserId") REFERENCES "User"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChordProgression" ADD CONSTRAINT "FK_ChordProgression_User" FOREIGN KEY ("UserId") REFERENCES "User"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionChord" ADD CONSTRAINT "FK_ProgressionChord_ChordProgression" FOREIGN KEY ("UserId") REFERENCES "ChordProgression"("UserId") ON DELETE CASCADE ON UPDATE CASCADE;

