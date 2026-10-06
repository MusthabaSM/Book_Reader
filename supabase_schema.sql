-- Create the user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    custom_shelves JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the library_books table
CREATE TABLE IF NOT EXISTS public.library_books (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    book_id TEXT NOT NULL,
    title TEXT NOT NULL,
    authors JSONB DEFAULT '[]'::jsonb,
    genres JSONB DEFAULT '[]'::jsonb,
    publication_year INTEGER,
    source_format TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    date_added TIMESTAMP WITH TIME ZONE NOT NULL,
    date_last_opened TIMESTAMP WITH TIME ZONE,
    reading_progress JSONB,
    is_favorite BOOLEAN DEFAULT false,
    series_title TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) so users can only access their own data
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;

-- Create policies for user_settings
CREATE POLICY "Users can view their own settings."
    ON public.user_settings FOR SELECT
    USING ( auth.uid() = user_id );

CREATE POLICY "Users can insert their own settings."
    ON public.user_settings FOR INSERT
    WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can update their own settings."
    ON public.user_settings FOR UPDATE
    USING ( auth.uid() = user_id );

-- Create policies for library_books
CREATE POLICY "Users can view their own books."
    ON public.library_books FOR SELECT
    USING ( auth.uid() = user_id );

CREATE POLICY "Users can insert their own books."
    ON public.library_books FOR INSERT
    WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can update their own books."
    ON public.library_books FOR UPDATE
    USING ( auth.uid() = user_id );

CREATE POLICY "Users can delete their own books."
    ON public.library_books FOR DELETE
    USING ( auth.uid() = user_id );
