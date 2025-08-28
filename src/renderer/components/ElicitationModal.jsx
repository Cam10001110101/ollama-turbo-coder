import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const ElicitationModal = ({ isOpen, onClose }) => {
  const [elicitations, setElicitations] = useState([]);
  const [activeElicitation, setActiveElicitation] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!window.electron) return;

    // Listen for elicitation requests from MCP servers
    const handleElicitationRequest = (elicitation) => {
      console.log('Received elicitation request:', elicitation);
      setElicitations(prev => [...prev, { ...elicitation, timestamp: Date.now() }]);
      
      // If no active elicitation, set this as active
      if (!activeElicitation) {
        setActiveElicitation(elicitation);
        setInputValue('');
        setSelectedOption('');
      }
    };

    // Set up IPC listener
    window.electron.ipcRenderer?.on('mcp-elicitation-request', handleElicitationRequest);

    return () => {
      window.electron.ipcRenderer?.removeListener('mcp-elicitation-request', handleElicitationRequest);
    };
  }, [activeElicitation]);

  const handleConfirmation = (confirmed) => {
    if (!activeElicitation) return;
    
    setProcessing(true);
    const responseChannel = `mcp-elicitation-response-${activeElicitation.id}`;
    
    // Send response back to main process
    window.electron.ipcRenderer?.send(responseChannel, {
      confirmed
    });
    
    // Clear active elicitation and move to next
    setActiveElicitation(null);
    setElicitations(prev => prev.filter(e => e.id !== activeElicitation.id));
    setProcessing(false);
    
    // Set next elicitation as active if any
    if (elicitations.length > 1) {
      setActiveElicitation(elicitations.find(e => e.id !== activeElicitation.id));
    }
  };

  const handleInputSubmit = () => {
    if (!activeElicitation || !inputValue.trim()) return;
    
    setProcessing(true);
    const responseChannel = `mcp-elicitation-response-${activeElicitation.id}`;
    
    // Send response back to main process
    window.electron.ipcRenderer?.send(responseChannel, {
      value: inputValue,
      cancelled: false
    });
    
    // Clear and move to next
    setInputValue('');
    setActiveElicitation(null);
    setElicitations(prev => prev.filter(e => e.id !== activeElicitation.id));
    setProcessing(false);
    
    // Set next elicitation as active if any
    if (elicitations.length > 1) {
      setActiveElicitation(elicitations.find(e => e.id !== activeElicitation.id));
    }
  };

  const handleSelectSubmit = () => {
    if (!activeElicitation || !selectedOption) return;
    
    setProcessing(true);
    const responseChannel = `mcp-elicitation-response-${activeElicitation.id}`;
    
    // Send response back to main process
    window.electron.ipcRenderer?.send(responseChannel, {
      value: selectedOption,
      cancelled: false
    });
    
    // Clear and move to next
    setSelectedOption('');
    setActiveElicitation(null);
    setElicitations(prev => prev.filter(e => e.id !== activeElicitation.id));
    setProcessing(false);
    
    // Set next elicitation as active if any
    if (elicitations.length > 1) {
      setActiveElicitation(elicitations.find(e => e.id !== activeElicitation.id));
    }
  };

  const handleCancel = () => {
    if (!activeElicitation) return;
    
    const responseChannel = `mcp-elicitation-response-${activeElicitation.id}`;
    
    // Send cancellation response
    window.electron.ipcRenderer?.send(responseChannel, {
      cancelled: true
    });
    
    // Clear active elicitation
    setActiveElicitation(null);
    setElicitations(prev => prev.filter(e => e.id !== activeElicitation.id));
    
    // Set next elicitation as active if any
    if (elicitations.length > 1) {
      setActiveElicitation(elicitations[1]);
    }
  };

  // Don't render if not open or no active elicitation
  if (!isOpen || !activeElicitation) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              <CardTitle>Server Request</CardTitle>
            </div>
            {elicitations.length > 1 && (
              <span className="text-sm text-gray-500">
                {elicitations.length} pending
              </span>
            )}
          </div>
          {activeElicitation.serverId && (
            <div className="text-sm text-gray-500 mt-1">
              From: {activeElicitation.serverId}
            </div>
          )}
        </CardHeader>
        
        <CardContent>
          {activeElicitation.title && (
            <h3 className="font-semibold mb-2">{activeElicitation.title}</h3>
          )}
          
          {activeElicitation.description && (
            <CardDescription className="mb-4">
              {activeElicitation.description}
            </CardDescription>
          )}

          {/* Confirmation Type */}
          {activeElicitation.type === 'confirmation' && (
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => handleConfirmation(false)}
                disabled={processing}
              >
                <XCircle className="w-4 h-4 mr-1" />
                No
              </Button>
              <Button
                onClick={() => handleConfirmation(true)}
                disabled={processing}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Yes
              </Button>
            </div>
          )}

          {/* Input Type */}
          {activeElicitation.type === 'input' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="elicitation-input">
                  {activeElicitation.inputLabel || 'Enter your response:'}
                </Label>
                <Input
                  id="elicitation-input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputValue.trim()) {
                      handleInputSubmit();
                    }
                  }}
                  placeholder={activeElicitation.placeholder || 'Type your response...'}
                  disabled={processing}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInputSubmit}
                  disabled={processing || !inputValue.trim()}
                >
                  Submit
                </Button>
              </div>
            </div>
          )}

          {/* Select Type */}
          {activeElicitation.type === 'select' && activeElicitation.options?.choices && (
            <div className="space-y-4">
              <RadioGroup
                value={selectedOption}
                onValueChange={setSelectedOption}
                disabled={processing}
              >
                {activeElicitation.options.choices.map((choice, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={choice.value}
                      id={`option-${idx}`}
                    />
                    <Label 
                      htmlFor={`option-${idx}`}
                      className="cursor-pointer flex-1"
                    >
                      {choice.label || choice.value}
                      {choice.description && (
                        <span className="block text-xs text-gray-500 mt-1">
                          {choice.description}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSelectSubmit}
                  disabled={processing || !selectedOption}
                >
                  Select
                </Button>
              </div>
            </div>
          )}

          {/* Unknown Type */}
          {!['confirmation', 'input', 'select'].includes(activeElicitation.type) && (
            <div className="text-center py-4">
              <p className="text-gray-500">
                Unknown elicitation type: {activeElicitation.type}
              </p>
              <Button
                onClick={handleCancel}
                className="mt-4"
              >
                Dismiss
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ElicitationModal;