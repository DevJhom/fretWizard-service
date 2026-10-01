BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[User] (
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Username] NVARCHAR(100) NOT NULL,
    [PasswordHash] NVARCHAR(100),
    [IsActive] BIT NOT NULL CONSTRAINT [User_IsActive_df] DEFAULT 1,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [User_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [ModifiedDate] DATETIME2 NOT NULL,
    CONSTRAINT [PK_User] PRIMARY KEY CLUSTERED ([UserId]),
    CONSTRAINT [UQ_User_Email] UNIQUE NONCLUSTERED ([Email])
);

-- CreateTable
CREATE TABLE [dbo].[UserLogin] (
    [UserLoginId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Provider] NVARCHAR(20) NOT NULL,
    [ProviderUserId] NVARCHAR(255) NOT NULL,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [UserLogin_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_UserLogin] PRIMARY KEY CLUSTERED ([UserLoginId]),
    CONSTRAINT [UQ_UserLogin_Provider_ProviderUserId] UNIQUE NONCLUSTERED ([Provider],[ProviderUserId])
);

-- CreateTable
CREATE TABLE [dbo].[RefreshToken] (
    [TokenId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [TokenHash] CHAR(64) NOT NULL,
    [FamilyId] UNIQUEIDENTIFIER NOT NULL,
    [ExpiresAt] DATETIME2 NOT NULL,
    [RevokedAt] DATETIME2,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [RefreshToken_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_RefreshToken] PRIMARY KEY CLUSTERED ([TokenId]),
    CONSTRAINT [UQ_RefreshToken_TokenHash] UNIQUE NONCLUSTERED ([TokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[LibraryCard] (
    [CardId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Setup] NVARCHAR(10) NOT NULL,
    [CreatedDate] DATETIME2 NOT NULL CONSTRAINT [LibraryCard_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [ModifiedDate] DATETIME2 NOT NULL,
    CONSTRAINT [PK_LibraryCard] PRIMARY KEY CLUSTERED ([CardId])
);

-- CreateTable
CREATE TABLE [dbo].[CardFretboard] (
    [CardFretboardId] UNIQUEIDENTIFIER NOT NULL,
    [CardId] UNIQUEIDENTIFIER NOT NULL,
    [Position] INT NOT NULL,
    [KeyName] NVARCHAR(5) NOT NULL,
    [Accidental] NVARCHAR(10) NOT NULL,
    [Tonality] NVARCHAR(10) NOT NULL,
    [Pattern] NVARCHAR(50) NOT NULL,
    [FretAmount] INT NOT NULL,
    [ChordPosition] INT NOT NULL,
    [ChordView] NVARCHAR(10),
    [ShapeC] BIT NOT NULL,
    [ShapeA] BIT NOT NULL,
    [ShapeG] BIT NOT NULL,
    [ShapeE] BIT NOT NULL,
    [ShapeD] BIT NOT NULL,
    [StringLowE] BIT NOT NULL,
    [StringA] BIT NOT NULL,
    [StringD] BIT NOT NULL,
    [StringG] BIT NOT NULL,
    [StringB] BIT NOT NULL,
    [StringHighE] BIT NOT NULL,
    [HighlightNotes] NVARCHAR(500) NOT NULL,
    CONSTRAINT [PK_CardFretboard] PRIMARY KEY CLUSTERED ([CardFretboardId]),
    CONSTRAINT [UQ_CardFretboard_CardId_Position] UNIQUE NONCLUSTERED ([CardId],[Position])
);

-- CreateTable
CREATE TABLE [dbo].[WorkspaceFretboard] (
    [WorkspaceFretboardId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Setup] NVARCHAR(10) NOT NULL,
    [Position] INT NOT NULL,
    [KeyName] NVARCHAR(5) NOT NULL,
    [Accidental] NVARCHAR(10) NOT NULL,
    [Tonality] NVARCHAR(10) NOT NULL,
    [Pattern] NVARCHAR(50) NOT NULL,
    [FretAmount] INT NOT NULL,
    [ChordPosition] INT NOT NULL,
    [ChordView] NVARCHAR(10),
    [ShapeC] BIT NOT NULL,
    [ShapeA] BIT NOT NULL,
    [ShapeG] BIT NOT NULL,
    [ShapeE] BIT NOT NULL,
    [ShapeD] BIT NOT NULL,
    [StringLowE] BIT NOT NULL,
    [StringA] BIT NOT NULL,
    [StringD] BIT NOT NULL,
    [StringG] BIT NOT NULL,
    [StringB] BIT NOT NULL,
    [StringHighE] BIT NOT NULL,
    [HighlightNotes] NVARCHAR(500) NOT NULL,
    CONSTRAINT [PK_WorkspaceFretboard] PRIMARY KEY CLUSTERED ([WorkspaceFretboardId]),
    CONSTRAINT [UQ_WorkspaceFretboard_UserId_Setup_Position] UNIQUE NONCLUSTERED ([UserId],[Setup],[Position])
);

-- CreateTable
CREATE TABLE [dbo].[ChordProgression] (
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [KeyName] NVARCHAR(5) NOT NULL,
    [Tonality] NVARCHAR(10) NOT NULL,
    [ModifiedDate] DATETIME2 NOT NULL,
    CONSTRAINT [PK_ChordProgression] PRIMARY KEY CLUSTERED ([UserId])
);

-- CreateTable
CREATE TABLE [dbo].[ProgressionChord] (
    [ProgressionChordId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Position] INT NOT NULL,
    [Degree] INT NOT NULL,
    CONSTRAINT [PK_ProgressionChord] PRIMARY KEY CLUSTERED ([ProgressionChordId]),
    CONSTRAINT [UQ_ProgressionChord_UserId_Position] UNIQUE NONCLUSTERED ([UserId],[Position])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_UserLogin_UserId] ON [dbo].[UserLogin]([UserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_RefreshToken_UserId] ON [dbo].[RefreshToken]([UserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_RefreshToken_FamilyId] ON [dbo].[RefreshToken]([FamilyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_LibraryCard_UserId_CreatedDate] ON [dbo].[LibraryCard]([UserId], [CreatedDate]);

-- AddForeignKey
ALTER TABLE [dbo].[UserLogin] ADD CONSTRAINT [FK_UserLogin_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[User]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RefreshToken] ADD CONSTRAINT [FK_RefreshToken_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[User]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LibraryCard] ADD CONSTRAINT [FK_LibraryCard_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[User]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CardFretboard] ADD CONSTRAINT [FK_CardFretboard_LibraryCard] FOREIGN KEY ([CardId]) REFERENCES [dbo].[LibraryCard]([CardId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkspaceFretboard] ADD CONSTRAINT [FK_WorkspaceFretboard_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[User]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ChordProgression] ADD CONSTRAINT [FK_ChordProgression_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[User]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProgressionChord] ADD CONSTRAINT [FK_ProgressionChord_ChordProgression] FOREIGN KEY ([UserId]) REFERENCES [dbo].[ChordProgression]([UserId]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

