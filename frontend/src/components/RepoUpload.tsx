import React, { useState, useRef } from 'react';
import type { RepositoryUploadResponse } from '../types/repo';
import { formatBytes } from '../utils/formatUtils';

interface RepoUploadProps {
  onUploadSuccess: (data: RepositoryUploadResponse) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const RepoUpload: React.FC<RepoUploadProps> = ({ onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);

    // Validate extension
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Invalid file format. Please upload a repository ZIP archive (.zip).');
      setSelectedFile(null);
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(
        `File is too large (${formatBytes(file.size)}). Maximum allowed size is 50MB.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('repoZip', selectedFile);

    try {
      const response = await fetch('/api/repos/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Upload failed with status ${response.status}`);
      }

      onUploadSuccess(data as RepositoryUploadResponse);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during upload.';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <div
        className={`dropzone ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".zip"
          style={{ display: 'none' }}
        />

        <div className="dropzone-content">
          <span className="dropzone-icon">📁</span>
          {selectedFile ? (
            <div className="selected-file-info">
              <span className="file-name-label">{selectedFile.name}</span>
              <span className="file-size-badge">{formatBytes(selectedFile.size)}</span>
              <p className="change-file-hint">Click or drop another file to replace</p>
            </div>
          ) : (
            <>
              <h3>Choose a repository ZIP or drag & drop here</h3>
              <p className="dropzone-hint">
                Supports JavaScript & TypeScript project ZIPs (up to 50MB)
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse Files
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="upload-error-box">
          <span className="error-icon">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {selectedFile && (
        <div className="upload-action-bar">
          <button
            type="button"
            className="btn btn-primary upload-btn"
            disabled={isUploading}
            onClick={handleUpload}
          >
            {isUploading ? (
              <span className="btn-loader">
                <span className="spinner"></span> Extracting & Scanning...
              </span>
            ) : (
              'Upload & Explore Repository'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
