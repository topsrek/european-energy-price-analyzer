
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';
import { parseSmartMeterData } from '@/utils/data-utils';
import { SmartMeterData } from '@/types/energy-data';

interface FileUploadProps {
  onFileLoaded: (data: SmartMeterData[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setLoading(true);
    
    try {
      // Read the file
      const arrayBuffer = await selectedFile.arrayBuffer();
      
      // Parse data - in a real app this would be an actual parser
      const data = parseSmartMeterData(arrayBuffer);
      
      // Notify parent component
      onFileLoaded(data);
      
      toast({
        title: "Daten geladen",
        description: `${selectedFile.name} wurde erfolgreich geladen.`
      });
    } catch (error) {
      console.error("Error loading file:", error);
      toast({
        title: "Fehler beim Laden",
        description: "Die Datei konnte nicht verarbeitet werden.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div 
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={handleFileClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,.xlsx,.bin"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex flex-col items-center">
        <Upload className="h-10 w-10 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          {loading ? 'Wird geladen...' : file ? file.name : 'Smart Meter Daten hochladen'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          CSV, JSON, XLSX oder proprietäre Dateiformate werden unterstützt
        </p>
        <Button 
          variant="outline" 
          className="mt-4"
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            handleFileClick();
          }}
        >
          Datei auswählen
        </Button>
      </div>
    </div>
  );
};

export default FileUpload;
