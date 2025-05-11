
import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { UploadIcon } from 'lucide-react';
import { parseSmartMeterData } from '@/utils/data-utils';

interface FileUploadProps {
  onFileLoaded: (data: any) => void;
  acceptedFileTypes?: string[];
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileLoaded,
  acceptedFileTypes = ['.csv', '.xlsx', '.xml', '.json']
}) => {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, []);
  
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };
  
  const processFile = async (file: File) => {
    // Check file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !acceptedFileTypes.some(type => type.toLowerCase().includes(fileExtension))) {
      toast({
        title: "Ungültiger Dateityp",
        description: `Bitte wählen Sie eine der folgenden Dateitypen: ${acceptedFileTypes.join(', ')}`,
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Read file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          let data;
          const result = e.target?.result;
          
          if (result instanceof ArrayBuffer) {
            // Parse binary data
            data = parseSmartMeterData(result);
          } else {
            // For text data
            const text = result as string;
            try {
              data = JSON.parse(text);
            } catch {
              // Not JSON, assume CSV or other format
              // For demo, just wrap in an array
              data = [text];
            }
          }
          
          setFileName(file.name);
          toast({
            title: "Datei hochgeladen",
            description: `${file.name} wurde erfolgreich verarbeitet.`
          });
          onFileLoaded(data);
          
        } catch (error) {
          console.error("Error parsing file:", error);
          toast({
            title: "Fehler beim Verarbeiten der Datei",
            description: "Die Datei konnte nicht korrekt gelesen werden.",
            variant: "destructive"
          });
        }
      };
      
      reader.onerror = () => {
        toast({
          title: "Fehler beim Lesen der Datei",
          description: "Die Datei konnte nicht gelesen werden.",
          variant: "destructive"
        });
      };
      
      if (/\.(csv|txt)$/i.test(file.name)) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
      
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging ? 'drag-active' : 'border-gray-300 hover:border-energy-primary'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <UploadIcon className="h-10 w-10 text-gray-400" />
        </div>
        <div>
          <p className="text-sm text-gray-600">
            {fileName ? (
              <>
                <span className="font-medium text-energy-primary">{fileName}</span> wurde hochgeladen
              </>
            ) : (
              <>
                Ziehen Sie Ihre Smart Meter Datei hierher oder{' '}
                <label className="text-energy-primary hover:underline cursor-pointer">
                  wählen Sie eine Datei
                  <input
                    type="file"
                    className="hidden"
                    accept={acceptedFileTypes.join(',')}
                    onChange={handleFileInputChange}
                  />
                </label>
              </>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Unterstützte Dateitypen: {acceptedFileTypes.join(', ')}
          </p>
        </div>
        
        {fileName && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFileName(null);
            }}
          >
            Andere Datei hochladen
          </Button>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
