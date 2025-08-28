import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { ChevronRight, ChevronDown, Search, MessageSquare, Play, X, Star, StarOff } from 'lucide-react';

const PromptsPanel = ({ isOpen = true, onInsertPrompt }) => {
  const [prompts, setPrompts] = useState([]);
  const [expandedServers, setExpandedServers] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [promptArguments, setPromptArguments] = useState({});
  const [promptResult, setPromptResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [showArgumentDialog, setShowArgumentDialog] = useState(false);

  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('promptFavorites');
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Fetch prompts on mount and when MCP status changes
  useEffect(() => {
    fetchPrompts();
    
    // Listen for MCP server status changes
    const unsubscribe = window.electron?.onMcpServerStatusChanged?.((status) => {
      if (status.prompts) {
        setPrompts(status.prompts);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchPrompts = async () => {
    try {
      const result = await window.electron?.getMcpPrompts?.();
      if (result?.prompts) {
        setPrompts(result.prompts);
        // Auto-expand servers with prompts
        const serversWithPrompts = {};
        result.prompts.forEach(prompt => {
          if (prompt.serverId) {
            serversWithPrompts[prompt.serverId] = true;
          }
        });
        setExpandedServers(serversWithPrompts);
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
    }
  };

  const toggleServer = (serverId) => {
    setExpandedServers(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  const toggleFavorite = (prompt) => {
    const promptKey = `${prompt.serverId}:${prompt.name}`;
    const newFavorites = favorites.includes(promptKey)
      ? favorites.filter(f => f !== promptKey)
      : [...favorites, promptKey];
    
    setFavorites(newFavorites);
    localStorage.setItem('promptFavorites', JSON.stringify(newFavorites));
  };

  const isFavorite = (prompt) => {
    return favorites.includes(`${prompt.serverId}:${prompt.name}`);
  };

  const selectPrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setPromptArguments({});
    setPromptResult(null);
    
    // If prompt has required arguments, show the dialog
    if (prompt.arguments?.some(arg => arg.required)) {
      setShowArgumentDialog(true);
    }
  };

  const executePrompt = async () => {
    if (!selectedPrompt) return;
    
    setLoading(true);
    setPromptResult(null);
    
    try {
      const result = await window.electron?.getMcpPrompt?.(
        selectedPrompt.name,
        promptArguments,
        selectedPrompt.serverId
      );
      
      if (result?.error) {
        setPromptResult({ error: result.error });
      } else {
        setPromptResult(result);
      }
    } catch (error) {
      console.error('Failed to execute prompt:', error);
      setPromptResult({ error: error.message });
    } finally {
      setLoading(false);
      setShowArgumentDialog(false);
    }
  };

  const insertPromptToChat = () => {
    if (promptResult?.messages && onInsertPrompt) {
      onInsertPrompt(promptResult.messages);
      setPromptResult(null);
      setSelectedPrompt(null);
    }
  };

  // Group prompts by server
  const promptsByServer = prompts.reduce((acc, prompt) => {
    const serverId = prompt.serverId || 'unknown';
    if (!acc[serverId]) {
      acc[serverId] = [];
    }
    acc[serverId].push(prompt);
    return acc;
  }, {});

  // Separate favorites
  const favoritePrompts = prompts.filter(p => isFavorite(p));

  // Filter prompts based on search query
  const filteredPromptsByServer = Object.entries(promptsByServer).reduce((acc, [serverId, serverPrompts]) => {
    const filtered = serverPrompts.filter(prompt => {
      const searchLower = searchQuery.toLowerCase();
      return (
        prompt.name?.toLowerCase().includes(searchLower) ||
        prompt.description?.toLowerCase().includes(searchLower)
      );
    });
    
    if (filtered.length > 0) {
      acc[serverId] = filtered;
    }
    return acc;
  }, {});

  if (!isOpen) return null;

  return (
    <div className="flex h-full">
      {/* Prompts List */}
      <div className="w-1/3 min-w-[250px] border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Prompts</h3>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="space-y-2">
            {/* Favorites Section */}
            {favoritePrompts.length > 0 && !searchQuery && (
              <Card className="overflow-hidden border-yellow-200 dark:border-yellow-800">
                <CardHeader className="py-2 px-3 bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium text-sm">Favorites</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {favoritePrompts.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {favoritePrompts.map((prompt, idx) => (
                      <div
                        key={`fav-${prompt.serverId}-${prompt.name}-${idx}`}
                        className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                          selectedPrompt?.name === prompt.name && selectedPrompt?.serverId === prompt.serverId
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : ''
                        }`}
                        onClick={() => selectPrompt(prompt)}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {prompt.name}
                            </div>
                            {prompt.description && (
                              <div className="text-xs text-gray-500 truncate">
                                {prompt.description}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(prompt);
                            }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          >
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Regular Prompts by Server */}
            {Object.keys(filteredPromptsByServer).length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchQuery ? 'No prompts found matching your search' : 'No prompts available'}
              </div>
            ) : (
              Object.entries(filteredPromptsByServer).map(([serverId, serverPrompts]) => (
                <Card key={serverId} className="overflow-hidden">
                  <CardHeader 
                    className="py-2 px-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => toggleServer(serverId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {expandedServers[serverId] ? 
                          <ChevronDown className="w-4 h-4" /> : 
                          <ChevronRight className="w-4 h-4" />
                        }
                        <span className="font-medium text-sm">{serverId}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {serverPrompts.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  {expandedServers[serverId] && (
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {serverPrompts.map((prompt, idx) => (
                          <div
                            key={`${prompt.name}-${idx}`}
                            className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                              selectedPrompt?.name === prompt.name && selectedPrompt?.serverId === prompt.serverId
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : ''
                            }`}
                            onClick={() => selectPrompt(prompt)}
                          >
                            <div className="flex items-start gap-2">
                              <MessageSquare className="w-4 h-4 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {prompt.name}
                                </div>
                                {prompt.description && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {prompt.description}
                                  </div>
                                )}
                                {prompt.arguments?.length > 0 && (
                                  <div className="flex gap-1 mt-1">
                                    {prompt.arguments.map((arg, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {arg.name}{arg.required && '*'}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(prompt);
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                              >
                                {isFavorite(prompt) ? (
                                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                ) : (
                                  <StarOff className="w-3 h-3 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Prompt Details and Execution */}
      <div className="flex-1 overflow-y-auto">
        {selectedPrompt ? (
          <div className="p-4">
            <div className="mb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedPrompt.name}</h3>
                  {selectedPrompt.description && (
                    <p className="text-sm text-gray-500 mt-1">{selectedPrompt.description}</p>
                  )}
                </div>
                <Button
                  onClick={() => executePrompt()}
                  disabled={loading}
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Execute
                </Button>
              </div>
            </div>

            {/* Arguments Dialog */}
            {showArgumentDialog && selectedPrompt.arguments?.length > 0 && (
              <Card className="mb-4 border-blue-200 dark:border-blue-800">
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Prompt Arguments</CardTitle>
                    <button
                      onClick={() => setShowArgumentDialog(false)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedPrompt.arguments.map((arg) => (
                    <div key={arg.name}>
                      <Label htmlFor={arg.name}>
                        {arg.name}
                        {arg.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      {arg.description && (
                        <p className="text-xs text-gray-500 mb-1">{arg.description}</p>
                      )}
                      <Input
                        id={arg.name}
                        type="text"
                        value={promptArguments[arg.name] || ''}
                        onChange={(e) => setPromptArguments(prev => ({
                          ...prev,
                          [arg.name]: e.target.value
                        }))}
                        placeholder={`Enter ${arg.name}...`}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={executePrompt}
                      disabled={loading}
                      size="sm"
                    >
                      Execute with Arguments
                    </Button>
                    <Button
                      onClick={() => setShowArgumentDialog(false)}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}

            {/* Error State */}
            {promptResult?.error && (
              <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                <CardContent className="p-4">
                  <p className="text-red-600 dark:text-red-400">Error executing prompt:</p>
                  <p className="text-sm mt-1">{promptResult.error}</p>
                </CardContent>
              </Card>
            )}

            {/* Prompt Result */}
            {promptResult?.messages && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Prompt Result</h4>
                  {onInsertPrompt && (
                    <Button
                      onClick={insertPromptToChat}
                      size="sm"
                      variant="outline"
                    >
                      Insert to Chat
                    </Button>
                  )}
                </div>
                {promptResult.messages.map((message, idx) => (
                  <Card key={idx}>
                    <CardHeader className="py-2">
                      <Badge variant={message.role === 'system' ? 'secondary' : 'default'}>
                        {message.role}
                      </Badge>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <pre className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a prompt to view details and execute
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptsPanel;