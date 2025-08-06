import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPerplexity } from 'https://esm.sh/@ai-sdk/perplexity@1'
import { generateText } from 'https://esm.sh/ai@4'

// Types
interface Citation {
  number: number;
  title: string;
  url: string;
  isCited: boolean;
  favicon: string;
}

interface NewsDigest {
  content: string;
  citations: Citation[];
  timestamp: string;
  explicitSentiment?: 'up' | 'down' | 'neutral';
}

// Domain filtering configuration for Perplexity API
const DOMAIN_FILTER = [
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
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Starting automated summary generation...')

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const perplexityApiKey = Deno.env.get('VITE_PERPLEXITY_API_KEY')!

    if (!supabaseUrl || !supabaseServiceKey || !perplexityApiKey) {
      throw new Error('Missing required environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if summary already exists in the last 6 hours
    const now = new Date()
    const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000))

    console.log('Checking for existing summary since:', {
      fromDate: sixHoursAgo.toISOString(),
      currentTime: now.toISOString()
    })

    const { data: existingSummary, error: checkError } = await supabase
      .from('daily_summaries')
      .select('*')
      .gte('timestamp', sixHoursAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1)

    if (checkError) {
      console.error('Error checking existing summary:', checkError)
      if (checkError.code !== 'PGRST116') { // PGRST116 means no data found
        throw checkError
      }
    }

    if (existingSummary && existingSummary.length > 0) {
      console.log('Summary already exists within the last 6 hours:', existingSummary[0].timestamp)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Summary already exists within the last 6 hours',
          summary: existingSummary[0]
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log('No existing summary found, generating new one...')

    // Generate new summary using Perplexity
    const prompt = 'Provide a unformatted concise but detailed analysis of todays most recent cryptocurrency market developments focusing on Solana Ethereum Bitcoin Polkadot Hedera Dogecoin Coinmetro token and other major tokens from multiple sources, including price movements only if major, significant news, and prevailing market sentiment with an emphasis on foresight. Only use information that is up-to-date as of the time of this request. Focus on actionable insights for traders. Sources should be diverse and not from one source. Include citations for your sources and number them sequentially. Format the response in clear paragraphs with proper spacing. Prioritize clarity, urgency, and immediate tradable insights. Use a sharp, direct voice that cuts through noise, think financial journalism meets street-smart trading floor. Avoid academic language; speak directly to traders bottom-line interests. Highlight potential opportunities and risks in a way that feels like insider knowledge, not generic reporting. Do not refer to the daily market as "todays market"—refer to it as "the market." Only use information that is current as of the time of this request; do not include outdated or speculative data.'

    console.log('Calling Perplexity API...')

    const perplexity = createPerplexity({
      apiKey: perplexityApiKey
    })

    const { text: generatedText, sources: apiSources } = await generateText({
      model: perplexity('sonar-pro'),
      prompt: prompt,
      temperature: 0.7,
      experimental_providerMetadata: {
        perplexity: {
          search_domain_filter: DOMAIN_FILTER
        }
      }
    })

    console.log('Received response from Perplexity API')
    console.log('Sources from API:', apiSources)

    // Process the response and create citations
    const citations: Citation[] = []
    
    if (apiSources && Array.isArray(apiSources)) {
      apiSources.forEach((source: any, index: number) => {
        citations.push({
          number: index + 1,
          title: source.title || `Source ${index + 1}`,
          url: source.url || '#',
          isCited: true,
          favicon: source.favicon || ''
        })
      })
    }

    // Validate that we have citations - empty citations indicate corrupted response
    if (!citations || citations.length === 0) {
      console.error('Invalid response from Perplexity API: no citations found')
      throw new Error('Invalid response from Perplexity API: citations are empty or corrupted')
    }

    console.log(`Validation passed: Found ${citations.length} valid citations, response is not corrupted`)

    // Create the digest
    const digest: NewsDigest = {
      content: generatedText,
      citations: citations,
      timestamp: new Date().toISOString()
    }

    console.log('Storing summary in database...')

    // Store the summary in the database
    const { error: insertError } = await supabase
      .from('daily_summaries')
      .insert([{
        content: digest.content,
        citations: digest.citations,
        timestamp: digest.timestamp
      }])

    if (insertError) {
      console.error('Error storing summary:', insertError)
      throw insertError
    }

    console.log('Successfully stored summary in database')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Summary generated and stored successfully',
        summary: digest
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in generate-daily-summary function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})