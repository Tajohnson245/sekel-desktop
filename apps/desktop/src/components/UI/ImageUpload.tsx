import { useState, useRef } from 'react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { uploadImage } from '../../lib/storage';
import { Button } from '@sekel/components';
import './ImageUpload.css';

interface ImageUploadProps {
    userId: string;
    onUpload: (url: string) => void;
    label?: string;
    className?: string;
    currentImage?: string | null;
    onRemove?: () => void;
}

export function ImageUpload({ userId, onUpload, label, className = '', currentImage, onRemove }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await uploadImage(file, userId);
            onUpload(url);
        } catch (error) {
            console.error('Failed to upload image:', error);
            alert('Failed to upload image. Please try again.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const triggerFileSelect = () => {
        if (!isUploading) {
            fileInputRef.current?.click();
        }
    };

    if (currentImage) {
        return (
            <div className={`image-upload-preview ${className}`}>
                <div className="preview-container">
                    <img src={currentImage} alt="Card attachment" className="image-preview-thumb" />
                    <Button
                        type="button"
                        variant="icon"
                        onClick={onRemove}
                        className="btn-remove-image"
                        icon={<Trash2 size={14} />}
                        title="Remove image"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={`image-upload-container ${className}`}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
                disabled={isUploading}
            />

            <Button
                type="button"
                variant="icon"
                onClick={triggerFileSelect}
                disabled={isUploading}
                title={label || "Upload Image"}
                className="image-upload-btn"
                icon={
                    isUploading ? (
                        <Loader2 className="animate-spin" size={16} />
                    ) : (
                        <ImageIcon size={16} />
                    )
                }
            />
        </div>
    );
}
