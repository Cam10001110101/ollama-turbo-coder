import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ChevronRight, ChevronDown, RefreshCw, Search, FileText, Image, Database, Globe } from 'lucide-react';

const ResourcesPanel = ({ isOpen = true }) => {
  const [resources, setResources] = useState([]);
  const [expandedServers, setExpandedServers] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [resourceContent, setResourceContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch resources on mount and when MCP status changes
  useEffect(() => {
    fetchResources();
    
    // Listen for MCP server status changes
    const unsubscribe = window.electron?.onMcpServerStatusChanged?.((status) => {
      if (status.resources) {
        setResources(status.resources);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchResources = async () => {
    try {
      const result = await window.electron?.getMcpResources?.();
      if (result?.resources) {
        setResources(result.resources);
        // Auto-expand servers with resources
        const serversWithResources = {};
        result.resources.forEach(resource => {
          if (resource.serverId) {
            serversWithResources[resource.serverId] = true;
          }
        });
        setExpandedServers(serversWithResources);
      }
    } catch (error) {
      console.error('Failed to fetch resources:', error);
    }
  };

  const refreshResources = async () => {
    setRefreshing(true);
    try {
      const result = await window.electron?.refreshMcpResources?.();
      if (result?.resources) {
        setResources(result.resources);
      }
      if (result?.errors) {
        console.error('Some servers failed to refresh:', result.errors);
      }
    } catch (error) {
      console.error('Failed to refresh resources:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const readResource = async (resource) => {
    setLoading(true);
    setSelectedResource(resource);
    setResourceContent(null);
    
    try {
      const result = await window.electron?.readMcpResource?.(resource.uri, resource.serverId);
      if (result?.error) {
        setResourceContent({ error: result.error });
      } else {
        setResourceContent(result);
      }
    } catch (error) {
      console.error('Failed to read resource:', error);
      setResourceContent({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleServer = (serverId) => {
    setExpandedServers(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  // Group resources by server
  const resourcesByServer = resources.reduce((acc, resource) => {
    const serverId = resource.serverId || 'unknown';
    if (!acc[serverId]) {
      acc[serverId] = [];
    }
    acc[serverId].push(resource);
    return acc;
  }, {});

  // Filter resources based on search query
  const filteredResourcesByServer = Object.entries(resourcesByServer).reduce((acc, [serverId, serverResources]) => {
    const filtered = serverResources.filter(resource => {
      const searchLower = searchQuery.toLowerCase();
      return (
        resource.name?.toLowerCase().includes(searchLower) ||
        resource.description?.toLowerCase().includes(searchLower) ||
        resource.uri?.toLowerCase().includes(searchLower)
      );
    });
    
    if (filtered.length > 0) {
      acc[serverId] = filtered;
    }
    return acc;
  }, {});

  // Get icon for resource based on mime type
  const getResourceIcon = (mimeType) => {
    if (!mimeType) return <FileText className="w-4 h-4" />;
    
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (mimeType.includes('json') || mimeType.includes('database')) return <Database className="w-4 h-4" />;
    if (mimeType.includes('html') || mimeType.includes('url')) return <Globe className="w-4 h-4" />;
    
    return <FileText className="w-4 h-4" />;
  };

  if (!isOpen) return null;

  return (
    <div className="flex h-full">
      {/* Resources List */}
      <div className="w-1/3 min-w-[250px] border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Resources</h3>
            <Button
              onClick={refreshResources}
              size="sm"
              variant="ghost"
              disabled={refreshing}
              className="p-1"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="space-y-2">
            {Object.keys(filteredResourcesByServer).length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchQuery ? 'No resources found matching your search' : 'No resources available'}
              </div>
            ) : (
              Object.entries(filteredResourcesByServer).map(([serverId, serverResources]) => (
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
                        {serverResources.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  {expandedServers[serverId] && (
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {serverResources.map((resource, idx) => (
                          <div
                            key={`${resource.uri}-${idx}`}
                            className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                              selectedResource?.uri === resource.uri && selectedResource?.serverId === resource.serverId
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : ''
                            }`}
                            onClick={() => readResource(resource)}
                          >
                            <div className="flex items-start gap-2">
                              {getResourceIcon(resource.mimeType)}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {resource.name}
                                </div>
                                {resource.description && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {resource.description}
                                  </div>
                                )}
                                <div className="text-xs text-gray-400 font-mono truncate">
                                  {resource.uri}
                                </div>
                              </div>
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

      {/* Resource Content Viewer */}
      <div className="flex-1 overflow-y-auto">
        {selectedResource ? (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{selectedResource.name}</h3>
              <p className="text-sm text-gray-500">{selectedResource.uri}</p>
              {selectedResource.mimeType && (
                <Badge variant="outline" className="mt-1">
                  {selectedResource.mimeType}
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : resourceContent?.error ? (
              <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                <CardContent className="p-4">
                  <p className="text-red-600 dark:text-red-400">Error loading resource:</p>
                  <p className="text-sm mt-1">{resourceContent.error}</p>
                </CardContent>
              </Card>
            ) : resourceContent?.contents ? (
              <div className="space-y-4">
                {resourceContent.contents.map((content, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      {content.mimeType && (
                        <Badge variant="outline" className="mb-2">
                          {content.mimeType}
                        </Badge>
                      )}
                      {content.type === 'text' ? (
                        <pre className="whitespace-pre-wrap font-mono text-sm">
                          {content.text}
                        </pre>
                      ) : (
                        <div className="text-gray-500">
                          {content.text || 'Binary content'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                Click "Read" to load resource content
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a resource to view its content
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourcesPanel;