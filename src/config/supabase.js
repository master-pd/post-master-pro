const { createClient } = require('@supabase/supabase-js');
const config = require('./index');
const logger = require('../utils/logger');

const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
    global: {
      headers: {
        'x-application-name': 'post-master',
      },
    },
  }
);

// Helper functions for file operations
const uploadToSupabase = async (file, bucket = 'user-profiles', path = '') => {
  try {
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path ? `${path}/${fileName}` : fileName;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      url: publicUrl,
      path: data.path,
      id: data.id,
    };
  } catch (error) {
    logger.error('Supabase upload error:', error);
    throw new Error(`Failed to upload to Supabase: ${error.message}`);
  }
};

const deleteFromSupabase = async (filePath, bucket = 'user-profiles') => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    logger.error('Supabase delete error:', error);
    throw new Error(`Failed to delete from Supabase: ${error.message}`);
  }
};

const getSignedUrl = async (filePath, bucket = 'user-profiles', expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  } catch (error) {
    logger.error('Supabase signed URL error:', error);
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }
};

module.exports = {
  supabase,
  uploadToSupabase,
  deleteFromSupabase,
  getSignedUrl,
};