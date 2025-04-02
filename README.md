# cm-intel

A React-based cryptocurrency news digest widget that displays daily market summaries with cited sources. The application fetches and presents concise crypto market updates and maintains historical data.

## Features

- Daily cryptocurrency market news summaries
- Citation links to source material
- Market sentiment analysis 
- Dark/light mode toggle
- Historical digest archive
- Responsive design for various screen sizes
- Automatic data caching

## Tech Stack

- React + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Supabase for data storage
- Lucide for icons

## Integration

To integrate cm-intel into your application:

1. Clone the repository:
   ```
   git clone https://github.com/kanewaltman/cm-intel.git
   ```

2. Install dependencies:
   ```
   cd cm-intel
   npm install
   ```

3. Create a `.env` file with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_KEY=your_supabase_key
   ```

4. Start development server:
   ```
   npm run dev
   ```

5. To use as a component in another project:
   - Build the project: `npm run build`
   - Import the component or copy the relevant code into your application

## Database Setup

This application requires a Supabase table called `daily_summaries` with the following structure:
- `id`: string (primary key)
- `content`: string (the digest content)
- `citations`: JSON array of Citation objects
- `timestamp`: string (ISO datetime)
- `created_at`: string (ISO datetime)

## Customization

Modify the `src/lib/config.ts` file to adjust:
- Update intervals
- Cache duration
- Maximum retries for API calls
- Number of historical summaries to display

## License

[MIT](https://choosealicense.com/licenses/mit/)

