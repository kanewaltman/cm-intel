import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Newspaper, RefreshCcw, AlertCircle, TrendingUp, Link, Moon, Sun, MoreVertical, Sparkles, ChevronDown } from 'lucide-react';
import { CryptoToken } from './components/CryptoToken';
import { supabase, fetchWithErrorHandling } from './lib/supabase';
import { format, parseISO, isToday, startOfDay, isSameDay, addDays } from 'date-fns';
import type { Database } from './lib/database.types';
import type { Citation } from './lib/database.types';
import { config } from './lib/config';
import { createPerplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

// Domain filtering configuration for Perplexity API
const DOMAIN_FILTER = [
  // Whitelisted crypto news sources
  "coinmetro.com",
  "reuters.com",
  "coingecko.com",
  "coindesk.com",
  "cointelegraph.com",
  "x.com",
  "cnbc.com",
  "fortune.com",
  "reddit.com",
  "finance.yahoo.com"
  ,
];

type NewsDigest = {
  content: string;
  citations: Citation[];
  timestamp: string;
  explicitSentiment?: MarketSentiment;
};

type MarketSentiment = 'up' | 'down' | 'neutral';

const FALLBACK_DATA: NewsDigest = {
  content: "The cryptocurrency market is showing resilience today with major assets maintaining their positions. Bitcoin continues to demonstrate strength above key support levels, while Ethereum's network activity remains robust. Market sentiment indicators suggest a cautiously optimistic outlook, with institutional interest remaining steady [1]. Technical analysis points to potential consolidation phases for leading cryptocurrencies [2].",
  citations: [
    {
      number: 1,
      title: "CoinGecko Market Analysis",
      url: "https://www.coingecko.com",
      isCited: true,
      favicon: "https://www.coingecko.com/favicon.ico"
    },
    {
      number: 2,
      title: "TradingView Technical Analysis",
      url: "https://www.tradingview.com",
      isCited: true,
      favicon: "https://www.tradingview.com/favicon.ico"
    }
  ],
  timestamp: new Date().toISOString()
};

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsDigest, setNewsDigest] = useState<NewsDigest | null>(null);
  const [historicalDigests, setHistoricalDigests] = useState<NewsDigest[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === null ? true : savedTheme === 'dark';
  });
  const [usingFallback, setUsingFallback] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment>('neutral');
  const [showSentimentDetails, setShowSentimentDetails] = useState(false);
  const [sentimentDetails, setSentimentDetails] = useState<{ 
    positive: number; 
    negative: number; 
    matches: { positive: string[]; negative: string[] }; 
    source: 'api' | 'calculated';
  }>({
    positive: 0,
    negative: 0,
    matches: { positive: [], negative: [] },
    source: 'calculated'
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const sentimentDetailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sentimentDetailsRef.current && !sentimentDetailsRef.current.contains(event.target as Node)) {
        setShowSentimentDetails(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkTodaysSummary = async (): Promise<NewsDigest | null> => {
    try {
      // Get today's date and tomorrow's date to create a proper range
      const today = startOfDay(new Date());
      const tomorrow = addDays(today, 1);
      
      console.log('Checking for summaries between:', {
        fromDate: today.toISOString(),
        toDate: tomorrow.toISOString(),
        environment: import.meta.env.MODE // Log current environment
      });
      
      // Create query with sufficient filters to handle both environments
      const query = supabase
        .from('daily_summaries')
        .select('*')
        .gte('timestamp', today.toISOString())
        .lt('timestamp', tomorrow.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1);
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Supabase query error:', error);
        if (error.code === 'PGRST116') {
          // No data found for today
          return null;
        }
        throw error;
      }

      if (data && data.length > 0) {
        console.log('Found today\'s summary:', data[0].timestamp);
        return data[0];
      }
      
      console.log('No summary found for today');
      return null;
    } catch (err) {
      console.error('Error checking today\'s summary:', err);
      return null;
    }
  };

  const getCachedData = (): NewsDigest | null => {
    const cached = localStorage.getItem('newsDigestCache');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(timestamp).getTime();
      if (cacheAge < config.CACHE_DURATION) {
        return data;
      }
    }
    return null;
  };

  const setCachedData = (data: NewsDigest) => {
    localStorage.setItem('newsDigestCache', JSON.stringify({
      data,
      timestamp: new Date().toISOString()
    }));
  };

  const fetchHistoricalDigests = async () => {
    try {
      // Get today's start timestamp
      const today = startOfDay(new Date()).toISOString();
      
      console.log('Fetching historical digests before:', today);
      
      // Get the most recent summary first
      const latestQuery = supabase
        .from('daily_summaries')
        .select('id')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      const { data: latestData, error: latestError } = await latestQuery;
      
      if (latestError) {
        console.error('Error fetching latest digest ID:', latestError);
        throw latestError;
      }
      
      // Get ID of most recent summary to exclude
      const latestId = latestData && latestData.length > 0 ? latestData[0].id : null;
      
      // Main query to fetch historical digests, excluding only the most recent one
      const query = supabase
        .from('daily_summaries')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(config.MAX_HISTORICAL_SUMMARIES);
      
      // If we have a latest ID, exclude it from results
      if (latestId) {
        query.neq('id', latestId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error('Error fetching historical digests:', error);
        throw error;
      }

      // Process and ensure each digest has a valid citations array
      const processedDigests = (data || []).map((digest: NewsDigest) => {
        // Ensure citations is an array
        if (!digest.citations || !Array.isArray(digest.citations)) {
          digest.citations = [];
        }
        
        // Add in any missing properties to citation objects
        digest.citations = digest.citations.map((citation: any) => {
          return {
            number: citation.number || 0,
            title: citation.title || `Source ${citation.number || 0}`,
            url: citation.url || '#',
            isCited: true,
            favicon: citation.favicon || ''
          };
        });
        
        return digest;
      });

      console.log("Loaded historical digests:", processedDigests.length);
      setHistoricalDigests(processedDigests);
    } catch (err) {
      console.error('Error fetching historical digests:', err);
    }
  };

  const storeSummary = async (digest: NewsDigest) => {
    try {
      console.log("Storing digest in database:", {
        content: digest.content.substring(0, 50) + "...",
        citations: digest.citations?.length || 0,
        timestamp: digest.timestamp,
        environment: import.meta.env.MODE
      });
      
      const query = supabase
        .from('daily_summaries')
        .insert([{
          content: digest.content,
          citations: digest.citations,
          timestamp: digest.timestamp
        }]);
      
      const { error } = await query;

      if (error) {
        console.error("Error storing digest:", error);
        throw error;
      }

      console.log("Successfully stored digest in database");
      
      // Refresh historical digests after storing new summary
      await fetchHistoricalDigests();
    } catch (err) {
      console.error('Error storing summary:', err);
    }
  };

  const getDomainName = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.replace(/^www\./, '').split('.');
      
      if (parts.length >= 2) {
        if (parts[0] === 'markets' && parts[1] === 'businessinsider') {
          return `businessinsider.${parts[parts.length - 1]}`;
        }
        
        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      }
      
      return hostname;
    } catch {
      return url;
    }
  };

  const getFavicon = async (url: string): Promise<string> => {
    try {
      const domain = new URL(url).origin;
      return `${domain}/favicon.ico`;
    } catch {
      return '';
    }
  };

  const processApiResponse = async (content: string, apiSources: any[] = []): Promise<NewsDigest> => {
    const citations: Citation[] = [];
    let processedContent = content;
    
    console.log("Original API response content:", content);
    console.log("API provided sources:", apiSources);
    
    // Extract explicit sentiment if present
    const sentimentMatch = content.match(/^SENTIMENT:\s*(BULLISH|BEARISH|NEUTRAL)/i);
    let explicitSentiment: MarketSentiment | undefined = undefined;
    
    if (sentimentMatch) {
      const sentimentValue = sentimentMatch[1].toUpperCase();
      explicitSentiment = sentimentValue === 'BULLISH' ? 'up' : sentimentValue === 'BEARISH' ? 'down' : 'neutral';
      
      // Remove the SENTIMENT line from the content
      processedContent = content.replace(/^SENTIMENT:\s*(BULLISH|BEARISH|NEUTRAL)\s*\n*/i, '').trim();
      
      console.log(`Explicit sentiment found: ${sentimentValue} (mapped to: ${explicitSentiment})`);
    }

    // Extract citations directly from the content
    // Look for citation patterns like [1], [2], etc.
    const citationReferences = processedContent.match(/\[(\d+)\]/g) || [];
    const uniqueCitationNumbers = [...new Set(citationReferences.map(ref => {
      const match = ref.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    }).filter(num => num > 0))];
    
    console.log("Found citation references:", citationReferences);
    console.log("Unique citation numbers:", uniqueCitationNumbers);

    // If we have API sources, use them first (preferred method)
    if (apiSources && apiSources.length > 0) {
      console.log("Using API provided sources");
      
      // Process sources from the AI SDK
      for (let i = 0; i < apiSources.length; i++) {
        const source = apiSources[i];
        // Add 1 to index because citation numbers typically start at 1
        const number = i + 1;
        const url = source.url || "";
        const title = source.title || getDomainName(url);
        const favicon = await getFavicon(url);
        
        citations.push({
          number,
          title,
          url,
          isCited: true,
          favicon
        });
      }
    } else {
      // Fall back to previous extraction methods
      
      // Look for a Sources section at the end in multiple formats
      // Format 1: "Sources:" with a list of URLs
      const sourcesBlockMatch = content.match(/(?:\*\*)?Sources(?:\*\*)?\s*(?::|$)([\s\S]+)?$/i);
      
      if (sourcesBlockMatch && sourcesBlockMatch[1]) {
        console.log("Found Sources block:", sourcesBlockMatch[1]);
        
        // Try to match numbered URLs in the sources section
        // Pattern: 1. http://example.com or [1] http://example.com or 1: http://example.com
        const sourcesLines = sourcesBlockMatch[1].split('\n');
        
        for (const line of sourcesLines) {
          // Match patterns like: "1. https://example.com" or "[1] https://example.com" or "1: https://example.com"
          const sourceMatch = line.match(/(?:^|\s)(?:\[?(\d+)\]?\.?:?\s+)(https?:\/\/[^\s]+)/i);
          
          if (sourceMatch) {
            const number = parseInt(sourceMatch[1], 10);
            const url = sourceMatch[2].trim();
            
            console.log(`Found source #${number}: ${url}`);
            
            if (url) {
              const favicon = await getFavicon(url);
              citations.push({
                number,
                title: getDomainName(url),
                url,
                isCited: true,
                favicon
              });
            }
          }
        }
        
        // Remove the Sources section from the content
        processedContent = processedContent.replace(/(?:\*\*)?Sources(?:\*\*)?\s*(?::|$)[\s\S]+$/i, '').trim();
      }
      
      // If we still haven't found any citations, look for sources format with "Sources:" section
      if (citations.length === 0) {
        const sourcesMatch = processedContent.match(/Sources?:?\s*([\s\S]+)$/i);
        if (sourcesMatch) {
          // Traditional format with Sources section
          const sourcesSection = sourcesMatch[1];
          const citationRegex = /\[(\d+)\]\s*([^[]+?)(?=\s*(?:\[\d+\]|$))/g;
          let match;
          
          while ((match = citationRegex.exec(sourcesSection)) !== null) {
            const number = parseInt(match[1], 10);
            const citationText = match[2].trim();
            const urlMatch = citationText.match(/(?:(?:https?:)?\/\/)?[\w-]+(?:\.[\w-]+)+[^\s)]+/);
            const url = urlMatch ? urlMatch[0] : '';
            const title = citationText
              .replace(url, '')
              .replace(/^[-:\s]+|[-:\s]+$/g, '')
              .trim();

            if (url) {
              const favicon = await getFavicon(url.startsWith('http') ? url : `https://${url}`);
              citations.push({
                number,
                title: title || getDomainName(url),
                url: url.startsWith('http') ? url : `https://${url}`,
                isCited: true,
                favicon
              });
            }
          }

          processedContent = processedContent.replace(/Sources?:?\s*[\s\S]+$/, '').trim();
        }
      }
      
      // If we still haven't found any citations, try inline JSON-like format
      if (citations.length === 0) {
        // New format - try to extract citations from inline references like "[url":"https://...]"
        const inlineCitationRegex = /\[\s*(?:"url"\s*:\s*"([^"]+)"|'url'\s*:\s*'([^']+)')\s*\]/g;
        let inlineMatch;
        let citationNumber = 1;
        
        while ((inlineMatch = inlineCitationRegex.exec(processedContent)) !== null) {
          const url = inlineMatch[1] || inlineMatch[2];
          
          if (url) {
            const favicon = await getFavicon(url);
            citations.push({
              number: citationNumber++,
              title: getDomainName(url),
              url: url,
              isCited: true,
              favicon
            });
          }
        }
        
        // Remove the inline citation references from the content
        processedContent = processedContent.replace(/\[\s*(?:"url"\s*:\s*"[^"]+"|'url'\s*:\s*'[^']+')\s*\]/g, '');
      }
    }

    // If we still have no citations but found citation references, log this issue
    if (citations.length === 0 && uniqueCitationNumbers.length > 0) {
      console.error("Found citation references but couldn't extract actual sources", uniqueCitationNumbers);
    }
    
    console.log("Extracted citations:", citations);

    // Sort citations by number
    citations.sort((a, b) => a.number - b.number);

    // Clean up markdown formatting after citation extraction
    processedContent = processedContent
      .replace(/\*\*/g, '') // Remove bold formatting
      .replace(/^\d+\.\s+/gm, '') // Remove numbered list formatting
      .replace(/\n+/g, '\n\n'); // Normalize paragraph breaks

    const digest: NewsDigest = {
      content: processedContent,
      citations: citations,
      timestamp: new Date().toISOString(),
      explicitSentiment
    };

    return digest;
  };

  const analyzeMarketSentiment = (content: string): MarketSentiment => {
    if (!content) return 'neutral';
    
    // Check if we have an explicit sentiment from the API and prioritize it
    if (newsDigest?.explicitSentiment) {
      console.log("Using explicit sentiment from API:", newsDigest.explicitSentiment);
      
      // Still run analysis for logging purposes but don't use the result
      runSentimentAnalysis(content, true);
      
      // Set sentiment details with API as source
      setSentimentDetails({
        ...sentimentDetails,
        source: 'api'
      });
      
      return newsDigest.explicitSentiment;
    }
    
    // Otherwise perform our own analysis
    return runSentimentAnalysis(content);
  };
  
  const runSentimentAnalysis = (content: string, logOnly: boolean = false): MarketSentiment => {
    // Define positive and negative keywords with context
    const positivePatterns = [
      { 
        name: "Positive price movement", 
        pattern: /\b(?:market|markets|prices?|bitcoin|btc|ethereum|eth)\b.{0,30}\b(?:up|higher|rise|rising|surge|surged|gain|gained|rally|bullish|positive)\b/gi 
      },
      { 
        name: "Breaking resistance", 
        pattern: /\b(?:increase|increased|climb|climbed|break|broke).{0,15}\b(?:resistance|key level|support)\b/gi 
      },
      { 
        name: "Bullish sentiment", 
        pattern: /\b(?:bull|bullish|uptrend|strength|strong|positive|optimistic|optimism)\b.{0,20}\b(?:sentiment|outlook|perspective|trend|market)\b/gi 
      },
      { 
        name: "General positive momentum", 
        pattern: /\b(?:outperform|recover|recovery|rebound|momentum)\b/gi 
      }
    ];
    
    const negativePatterns = [
      { 
        name: "Negative price movement", 
        pattern: /\b(?:market|markets|prices?|bitcoin|btc|ethereum|eth)\b.{0,30}\b(?:down|lower|fall|falling|fell|drop|dropped|decline|declined|bearish|negative)\b/gi 
      },
      { 
        name: "Breaking support", 
        pattern: /\b(?:drop|dropped|fall|fell|sink|sank).{0,15}\b(?:below|support|key level)\b/gi 
      },
      { 
        name: "Bearish sentiment", 
        pattern: /\b(?:bear|bearish|downtrend|weakness|weak|negative|pessimistic|pessimism)\b.{0,20}\b(?:sentiment|outlook|perspective|trend|market)\b/gi 
      },
      { 
        name: "General negative pressure", 
        pattern: /\b(?:underperform|loss|selloff|pressure|correction)\b/gi 
      }
    ];
    
    // Store matched phrases for logging
    const positiveMatches: Array<{text: string; category: string}> = [];
    const negativeMatches: Array<{text: string; category: string}> = [];
    
    // Count occurrences
    let positiveCount = 0;
    let negativeCount = 0;
    
    // Check for positive patterns
    positivePatterns.forEach(({name, pattern}) => {
      const matches = content.match(pattern);
      if (matches) {
        positiveCount += matches.length;
        matches.forEach(match => {
          positiveMatches.push({
            text: match.trim(),
            category: name
          });
        });
      }
    });
    
    // Check for negative patterns
    negativePatterns.forEach(({name, pattern}) => {
      const matches = content.match(pattern);
      if (matches) {
        negativeCount += matches.length;
        matches.forEach(match => {
          negativeMatches.push({
            text: match.trim(),
            category: name
          });
        });
      }
    });
    
    // Add weight based on specific strong indicators
    const positiveStrongPatterns = [
      { name: "Bull market", pattern: /\b(?:bull market)\b/gi, weight: 3 },
      { name: "Strong buy signal", pattern: /\b(?:strong buy signal)\b/gi, weight: 3 },
      { name: "Significant rally", pattern: /\b(?:significant rally)\b/gi, weight: 3 }
    ];
    
    const negativeStrongPatterns = [
      { name: "Bear market", pattern: /\b(?:bear market)\b/gi, weight: 3 },
      { name: "Strong sell signal", pattern: /\b(?:strong sell signal)\b/gi, weight: 3 },
      { name: "Significant drop", pattern: /\b(?:significant drop)\b/gi, weight: 3 }
    ];
    
    // Check for strong positive indicators
    positiveStrongPatterns.forEach(({name, pattern, weight}) => {
      const matches = content.match(pattern);
      if (matches) {
        positiveCount += weight * matches.length;
        matches.forEach(match => {
          positiveMatches.push({
            text: `[STRONG x${weight}] ${match.trim()}`,
            category: name
          });
        });
      }
    });
    
    // Check for strong negative indicators
    negativeStrongPatterns.forEach(({name, pattern, weight}) => {
      const matches = content.match(pattern);
      if (matches) {
        negativeCount += weight * matches.length;
        matches.forEach(match => {
          negativeMatches.push({
            text: `[STRONG x${weight}] ${match.trim()}`,
            category: name
          });
        });
      }
    });
    
    // Group matches by category for easy reading
    const groupedPositiveMatches = positiveMatches.reduce((acc, {text, category}) => {
      if (!acc[category]) acc[category] = [];
      acc[category].push(text);
      return acc;
    }, {} as Record<string, string[]>);
    
    const groupedNegativeMatches = negativeMatches.reduce((acc, {text, category}) => {
      if (!acc[category]) acc[category] = [];
      acc[category].push(text);
      return acc;
    }, {} as Record<string, string[]>);
    
    // Log the sentiment analysis details
    console.log("------- Market Sentiment Analysis -------");
    console.log(`Content length: ${content.length} characters`);
    console.log(`Positive indicators found: ${positiveCount}`);
    
    Object.entries(groupedPositiveMatches).forEach(([category, matches]) => {
      console.log(`  [${category}] (${matches.length}):`);
      matches.forEach((match, i) => console.log(`    - ${match}`));
    });
    
    console.log(`Negative indicators found: ${negativeCount}`);
    Object.entries(groupedNegativeMatches).forEach(([category, matches]) => {
      console.log(`  [${category}] (${matches.length}):`);
      matches.forEach((match, i) => console.log(`    - ${match}`));
    });
    
    // Only store sentiment details for UI display if not just logging
    if (!logOnly) {
      // Flatten arrays for display but keep the best examples from each category
      const flattenedPositives: string[] = [];
      const flattenedNegatives: string[] = [];
      
      // Take top examples from each category for display
      Object.entries(groupedPositiveMatches).forEach(([category, matches]) => {
        const categoryExamples = matches.slice(0, 2); // Take up to 2 examples per category
        flattenedPositives.push(...categoryExamples.map(m => `[${category}] ${m}`));
      });
      
      Object.entries(groupedNegativeMatches).forEach(([category, matches]) => {
        const categoryExamples = matches.slice(0, 2); // Take up to 2 examples per category
        flattenedNegatives.push(...categoryExamples.map(m => `[${category}] ${m}`));
      });
      
      setSentimentDetails({
        positive: positiveCount,
        negative: negativeCount,
        matches: {
          // Take 8 examples maximum to avoid overwhelming the UI
          positive: flattenedPositives.slice(0, 8),
          negative: flattenedNegatives.slice(0, 8)
        },
        source: 'calculated'
      });
    }
    
    // Determine sentiment based on counts, with a slight bias toward neutral
    let sentiment: MarketSentiment = 'neutral';
    if (positiveCount > negativeCount + 1) {
      sentiment = 'up';
    } else if (negativeCount > positiveCount + 1) {
      sentiment = 'down';
    }
    
    console.log(`Calculated sentiment: ${sentiment.toUpperCase()}`);
    if (newsDigest?.explicitSentiment) {
      console.log(`(Overridden by API explicit sentiment: ${newsDigest.explicitSentiment.toUpperCase()})`);
    }
    console.log("----------------------------------------");
    
    return sentiment;
  };

  const fetchNewsDigest = async (forceGenerate = false) => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    setUsingFallback(false);

    try {
      // Skip checking today's summary if force generate is true
      if (!forceGenerate) {
        const todaysSummary = await checkTodaysSummary();
        if (todaysSummary) {
          setNewsDigest(todaysSummary);
          setCachedData(todaysSummary);
          setMarketSentiment(analyzeMarketSentiment(todaysSummary.content));
          setLoading(false);
          return;
        }
      }

      try {
        // Use AI SDK to get text and sources
        const prompt = 'Provide a unformatted concise but detailed analysis of todays most recent cryptocurrency market developments focusing on Solana Ethereum Bitcoin Polkadot Hedera Dogecoin Coinmetro token and other major tokens from multiple sources, including price movements only if major, significant news, and prevailing market sentiment with an emphasis on foresight. Only use information that is up-to-date as of the time of this request. Focus on actionable insights for traders. Sources should be diverse and not from one source. Include citations for your sources and number them sequentially. Format the response in clear paragraphs with proper spacing. Prioritize clarity, urgency, and immediate tradable insights. Use a sharp, direct voice that cuts through noise, think financial journalism meets street-smart trading floor. Avoid academic language; speak directly to traders bottom-line interests. Highlight potential opportunities and risks in a way that feels like insider knowledge, not generic reporting. Do not refer to the daily market as “todays market”—refer to it as “the market.” Only use information that is current as of the time of this request; do not include outdated or speculative data.';
        
        console.log("Using AI SDK to generate text");
        
        // Get the API key from environment variables
        const apiKey = import.meta.env.VITE_PERPLEXITY_API_KEY;
        if (!apiKey) {
          throw new Error('VITE_PERPLEXITY_API_KEY environment variable is not set');
        }
        
        // Create Perplexity provider instance with API key
        const perplexity = createPerplexity({
          apiKey: apiKey
        });
        
        const { text: generatedText, sources: apiSources } = await generateText({
          model: perplexity('sonar-pro'),
          prompt: prompt,
          temperature: 0.7,
          experimental_providerMetadata: {
            perplexity: {
              search_domain_filter: DOMAIN_FILTER
            }
          }
        });

        console.log("Received response from AI SDK");
        console.log("Sources from AI SDK:", apiSources);
        
        // Process the response using our helper function
        const digest = await processApiResponse(generatedText, apiSources);
        
        setNewsDigest(digest);
        setCachedData(digest);
        await storeSummary(digest);
        setMarketSentiment(analyzeMarketSentiment(digest.content));
        setRetryCount(0);
        setUsingFallback(false);
      } catch (aiSdkError) {
        // If AI SDK fails, fall back to direct API call
        console.error('AI SDK Error:', aiSdkError);
        console.log('Falling back to direct API call');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Use Netlify Function in production, local proxy in development
        const apiEndpoint = import.meta.env.PROD 
          ? '/.netlify/functions/proxy-perplexity'
          : '/api/chat/completions';

        const response = await fetch(
          apiEndpoint,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'sonar-pro',
              messages: [
                {
                  role: 'user',
                  content: 'Provide a unformatted concise but detailed analysis of todays most recent cryptocurrency market developments focusing on Solana Ethereum Bitcoin Polkadot Hedera Dogecoin Coinmetro token and other major tokens from multiple sources, including price movements only if major, significant news, and prevailing market sentiment with an emphasis on foresight. Only use information that is up-to-date as of the time of this request. Focus on actionable insights for traders. Sources should be diverse and not from one source. Include citations for your sources and number them sequentially. Format the response in clear paragraphs with proper spacing. Prioritize clarity, urgency, and immediate tradable insights. Use a sharp, direct voice that cuts through noise, think financial journalism meets street-smart trading floor. Avoid academic language; speak directly to traders bottom-line interests. Highlight potential opportunities and risks in a way that feels like insider knowledge, not generic reporting. Do not refer to the daily market as “todays market”—refer to it as “the market.” Only use information that is current as of the time of this request; do not include outdated or speculative data.'
                }
              ],
              search_domain_filter: DOMAIN_FILTER
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('API Response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          
          if (response.status === 401) {
            throw new Error('API Key is invalid or not properly configured. Please check your environment variables.');
          }
          
          throw new Error(`API Error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
        }

        const data = await response.json();
        
        // Log the raw API response
        console.info('Raw API Response:', data);
        
        if (!data?.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from API');
        }

        const digest = await processApiResponse(data.choices[0].message.content);
        setNewsDigest(digest);
        setCachedData(digest);
        await storeSummary(digest);
        setMarketSentiment(analyzeMarketSentiment(digest.content));
        setRetryCount(0);
        setUsingFallback(false);
      }
    } catch (err) {
      console.error('API Error:', err);
      
      const cachedData = getCachedData();
      if (cachedData) {
        setNewsDigest(cachedData);
        setMarketSentiment(analyzeMarketSentiment(cachedData.content));
        setUsingFallback(true);
        setError('Using cached data from last successful update');
      } else if (!forceGenerate && retryCount < config.MAX_RETRIES) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchNewsDigest(false);
        }, retryDelay);
      } else {
        setNewsDigest(FALLBACK_DATA);
        setMarketSentiment(analyzeMarketSentiment(FALLBACK_DATA.content));
        setUsingFallback(true);
        setError('Unable to fetch latest data. Showing backup content.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewsDigest(false);
    fetchHistoricalDigests();
    const interval = setInterval(() => fetchNewsDigest(false), config.UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const renderContent = useCallback((content: string, digestCitations?: Citation[]) => {
    if (!content) return null;

    const parts = content.split(/(\[\d+\])/);
    const processedParts = parts.map((part, index) => {
      const citationMatch = part.match(/\[(\d+)\]/);
      if (citationMatch) {
        const number = parseInt(citationMatch[1], 10);
        // First check the provided citations, then fall back to current newsDigest
        const citation = digestCitations?.find(c => c.number === number) || 
                         newsDigest?.citations?.find(c => c.number === number);
        
        if (citation?.url && citation.url !== '#') {
          return (
            <a
              key={`citation-${index}-${number}`}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-link"
              title={citation.title}
            >
              [{number}]
            </a>
          );
        }
      }
      
      return formatCryptoTokens(part, index);
    });

    return processedParts;
  }, [newsDigest]);

  const formatCryptoTokens = (text: string, baseIndex: number) => {
    const cryptoRegex = /\b(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|XRP|Cardano|ADA|Dogecoin|DOGE)\b/g;
    const parts = text.split(cryptoRegex);
    
    return parts.map((part, index) => {
      const match = part.match(/^(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|XRP|Cardano|ADA|Dogecoin|DOGE)$/);
      if (match) {
        const symbol = {
          'Bitcoin': 'BTC',
          'BTC': 'BTC',
          'Ethereum': 'ETH',
          'ETH': 'ETH',
          'Solana': 'SOL',
          'SOL': 'SOL',
          'XRP': 'XRP',
          'Cardano': 'ADA',
          'ADA': 'ADA',
          'Dogecoin': 'DOGE',
          'DOGE': 'DOGE',
        }[match[0]] || 'BTC'; // Provide a fallback to avoid undefined
        
        return (
          <CryptoToken key={`${baseIndex}-crypto-${index}`} symbol={symbol}>
            {part}
          </CryptoToken>
        );
      }
      return <span key={`${baseIndex}-text-${index}`}>{part}</span>;
    });
  };

  const handleForceGenerate = () => {
    setShowMenu(false);
    fetchNewsDigest(true);
  };

  const renderDigest = (digest: NewsDigest) => {
    // Split content by paragraphs, handling both \n\n and potentially leftover numbered lists
    const paragraphs = digest.content
      .split(/\n\n+/)
      .filter(Boolean)
      .map(p => p.trim());
    
    const content = paragraphs.map((paragraph, index) => {
      // Check if this is a section header (might have leftover formatting)
      const isHeader = paragraph.includes('Actionable Insights') || 
                       paragraph.startsWith('**') ||
                       paragraph.length < 80 && paragraph.endsWith(':');
      
      if (isHeader) {
        return (
          <h3 key={`header-${index}`} className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">
            {renderContent(paragraph.replace(/\*\*/g, ''), digest.citations)}
          </h3>
        );
      }
      
      // Check if this is a numbered list item
      const listMatch = paragraph.match(/^\d+\.\s+(.*)/);
      if (listMatch) {
        return (
          <div key={`list-item-${index}`} className="mb-2 flex">
            <span className="mr-2">{paragraph.split('.')[0]}.</span>
            <div>{renderContent(listMatch[1], digest.citations)}</div>
          </div>
        );
      }
      
      // Normal paragraph
      return (
        <p key={`paragraph-${index}`} className="mb-4 last:mb-0">
          {renderContent(paragraph, digest.citations)}
        </p>
      );
    });

    return (
      <div className="space-y-3">
        {content}
        
        {digest.citations?.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[var(--card-border)]">
            <div className="sources-container">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">Sources</h2>
              <div className="flex flex-wrap gap-4">
                {digest.citations.map((citation) => (
                  <a
                    key={`source-${citation.number}`}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link group"
                    title={citation.title}
                  >
                    <img
                      src={citation.favicon || ''}
                      alt=""
                      className="w-5 h-5 rounded-sm"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        try {
                          // Parse the URL safely or use a fallback
                          const url = citation.url.startsWith('http') ? citation.url : `https://${citation.url}`;
                          const domain = new URL(url).hostname;
                          img.src = `https://www.google.com/s2/favicons?domain=${domain}`;
                        } catch {
                          // If URL is invalid, set a generic icon
                          img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
                        }
                      }}
                    />
                    <span className="source-tooltip">
                      {citation.title || `Source ${citation.number}`}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[var(--card-border)]">
          <p className="text-sm text-[var(--text-tertiary)]">
            Generated: {format(parseISO(digest.timestamp), 'PPpp')}
          </p>
        </div>
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="skeleton-text w-3/4"></div>
        <div className="skeleton-text w-5/6"></div>
        <div className="skeleton-text w-4/5"></div>
      </div>
      <div className="space-y-3">
        <div className="skeleton-text w-5/6"></div>
        <div className="skeleton-text w-3/4"></div>
        <div className="skeleton-text w-4/5"></div>
      </div>
      <div className="space-y-3">
        <div className="skeleton-text w-4/5"></div>
        <div className="skeleton-text w-5/6"></div>
        <div className="skeleton-text w-3/4"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--app-bg-color)] transition-colors duration-300">
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[720px] xl:max-w-[920px] 2xl:max-w-[1080px]">
        <div className="market-card">
          <div className="flex justify-between items-center mb-6 sm:mb-8">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Sentiment
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-full hover:bg-[var(--card-hover)] transition-colors duration-200"
                aria-label="Toggle dark mode"
              >
                {darkMode ? (
                  <Sun className="h-5 w-5 text-[var(--text-tertiary)]" />
                ) : (
                  <Moon className="h-5 w-5 text-[var(--text-tertiary)]" />
                )}
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-full hover:bg-[var(--card-hover)] transition-colors duration-200"
                  aria-label="More options"
                >
                  <MoreVertical className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[var(--card-bg)] border border-[var(--card-border)] z-10">
                    <div className="py-1">
                      <button
                        onClick={handleForceGenerate}
                        className="flex items-center w-full px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors duration-200"
                        disabled={loading}
                      >
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Force Generate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <p className="date-text">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-1 relative">
              <span className="text-xl font-bold text-[var(--text-primary)]">Markets are</span>
              <div>
                <button 
                  onClick={() => setShowSentimentDetails(!showSentimentDetails)} 
                  className="flex items-center cursor-pointer"
                  aria-label="Show sentiment analysis details"
                >
                  {marketSentiment === 'up' && <span className="market-up">up</span>}
                  {marketSentiment === 'down' && <span className="market-down">down</span>}
                  {marketSentiment === 'neutral' && <span className="market-neutral">neutral</span>}
                </button>
                
                {showSentimentDetails && (
                  <div 
                    ref={sentimentDetailsRef}
                    className="absolute left-0 top-full mt-2 z-20 p-4 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg text-sm w-72 sm:w-96"
                  >
                    <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">Sentiment Analysis</h3>
                    
                    {newsDigest?.explicitSentiment && (
                      <div className="mb-3 pb-3 border-b border-[var(--card-border)]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[var(--text-primary)]">API Sentiment:</span>
                          <span className={`text-[var(--brand-${newsDigest.explicitSentiment === 'up' ? 'success' : newsDigest.explicitSentiment === 'down' ? 'danger' : 'info'})]`}>
                            {newsDigest.explicitSentiment === 'up' ? 'Bullish' : 
                             newsDigest.explicitSentiment === 'down' ? 'Bearish' : 'Neutral'}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-3">
                      <div className="flex justify-between mb-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--text-primary)]">Indicators:</span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            (Total: {sentimentDetails.positive + sentimentDetails.negative})
                          </span>
                        </div>
                        <div className="flex gap-3">
                          <div>
                            <span className="text-[var(--brand-success)]">{sentimentDetails.positive} </span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              ({sentimentDetails.positive + sentimentDetails.negative > 0 
                                ? Math.round(sentimentDetails.positive / (sentimentDetails.positive + sentimentDetails.negative) * 100) 
                                : 0}%)
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--brand-danger)]">{sentimentDetails.negative} </span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              ({sentimentDetails.positive + sentimentDetails.negative > 0 
                                ? Math.round(sentimentDetails.negative / (sentimentDetails.positive + sentimentDetails.negative) * 100) 
                                : 0}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Sentiment bar visualization */}
                      <div className="h-2 rounded-full bg-[var(--card-hover)] overflow-hidden mb-3">
                        <div 
                          className="h-full bg-gradient-to-r from-[var(--brand-danger)] to-[var(--brand-success)]" 
                          style={{ 
                            width: `${sentimentDetails.positive + sentimentDetails.negative > 0 
                              ? Math.round(sentimentDetails.positive / (sentimentDetails.positive + sentimentDetails.negative) * 100) 
                              : 50}%` 
                          }}
                        ></div>
                      </div>
                      
                      <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
                        <span>Bearish</span>
                        <span>Neutral</span>
                        <span>Bullish</span>
                      </div>
                    </div>
                    
                    {sentimentDetails.matches.positive.length > 0 && (
                      <div className="mb-3">
                        <h4 className="font-medium text-[var(--text-primary)] mb-1">Positive Indicators:</h4>
                        <ul className="text-xs text-[var(--text-secondary)] pl-3 space-y-1">
                          {sentimentDetails.matches.positive.map((match, i) => (
                            <li key={`pos-${i}`} className="truncate hover:text-clip">{match}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {sentimentDetails.matches.negative.length > 0 && (
                      <div>
                        <h4 className="font-medium text-[var(--text-primary)] mb-1">Negative Indicators:</h4>
                        <ul className="text-xs text-[var(--text-secondary)] pl-3 space-y-1">
                          {sentimentDetails.matches.negative.map((match, i) => (
                            <li key={`neg-${i}`} className="truncate hover:text-clip">{match}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="text-xs text-[var(--text-tertiary)] mt-3 pt-3 border-t border-[var(--card-border)]">
                      <div className="mb-1">
                        Final verdict: <span className="font-medium">{marketSentiment === 'up' ? 'Bullish' : marketSentiment === 'down' ? 'Bearish' : 'Neutral'}</span>
                        {sentimentDetails.source === 'api' && " (based on API assessment)"}
                      </div>
                      <div>
                        {sentimentDetails.source === 'api' 
                          ? "API's explicit sentiment assessment prioritized over calculated indicators" 
                          : "Sentiment calculated by analyzing content for market indicators"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`sm:content-box ${!loading ? 'space-y-6' : ''}`}>
            <div className="flex justify-between items-center mb-4">
              <div className="daily-summary">
                <Sparkles className="h-4 w-4" />
                <span>{loading ? 'Generating' : 'Daily Summary'}</span>
              </div>
            </div>

            <div className="content-text">
              {loading ? (
                <LoadingSkeleton />
              ) : newsDigest ? (
                renderDigest(newsDigest)
              ) : (
                <p>No market data available</p>
              )}
            </div>
          </div>

          {/* Historical Summaries */}
          <div className="mt-8">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors duration-200"
            >
              <h2 className="text-lg font-semibold">Historical Summaries</h2>
              <ChevronDown
                className={`h-5 w-5 transform transition-transform duration-200 ${
                  showHistory ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showHistory && (
              <div className="mt-4 space-y-8">
                {historicalDigests.map((digest, index) => (
                  <div
                    key={index}
                    className="p-6 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]"
                  >
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        {format(parseISO(digest.timestamp), 'PPPP')}
                      </h3>
                    </div>
                    <div className="content-text">
                      {renderDigest(digest)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;