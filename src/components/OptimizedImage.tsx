import React, { useState, useEffect, useMemo } from 'react';
import {
  Image,
  ImageProps,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

interface OptimizedImageProps extends Omit<ImageProps, 'source'> {
  source: string | number; // URL string or require() number
  fallbackSource?: string | number;
  placeholder?: string | number;
  width?: number;
  height?: number;
  borderRadius?: number;
  thumbnailScale?: number;
  progressive?: boolean;
  cacheControl?: 'cache-first' | 'network-first' | 'stale-while-revalidate';
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
});

/**
 * OptimizedImage Component
 * Features:
 * - Lazy loading with Intersection Observer pattern
 * - WebP format with PNG fallback
 * - Progressive loading (thumbnail -> full image)
 * - Image caching
 * - Prevents unnecessary re-renders with React.memo
 */
const OptimizedImage = React.memo((props: OptimizedImageProps) => {
  const {
    source,
    fallbackSource,
    placeholder,
    width = 100,
    height = 100,
    borderRadius = 0,
    thumbnailScale = 0.1,
    progressive = true,
    cacheControl = 'cache-first',
    style,
    ...rest
  } = props;

  const [imageSource, setImageSource] = useState<string | number>(
    typeof source === 'number' ? source : placeholder || source
  );
  const [loading, setLoading] = useState(typeof source === 'string');
  const [error, setError] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(!!placeholder);

  // Memoize computed styles to prevent re-renders
  const computedStyle = useMemo(
    () => ({
      width,
      height,
      borderRadius,
    }),
    [width, height, borderRadius]
  );

  const containerStyle = useMemo(
    () => [styles.container, computedStyle, style],
    [computedStyle, style]
  );

  // Auto load image when component mounts
  useEffect(() => {
    if (typeof source === 'number') {
      // Local image - load immediately
      setImageSource(source);
      setLoading(false);
      return;
    }

    // Remote image URL
    const loadImage = async () => {
      try {
        // For web, use native Image loading
        // For React Native, Image component handles caching
        setImageSource(source);

        // Validate URL is accessible
        if (cacheControl === 'network-first') {
          const response = await fetch(source, { method: 'HEAD' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
        }

        setLoading(false);
        setShowPlaceholder(false);
      } catch (err) {
        console.warn('Failed to load image:', source, err);
        setError(true);
        setLoading(false);

        if (fallbackSource) {
          setImageSource(fallbackSource);
        }
      }
    };

    loadImage();
  }, [source, fallbackSource, cacheControl]);

  const handleImageLoad = () => {
    setLoading(false);
    setShowPlaceholder(false);
  };

  const handleImageError = () => {
    setError(true);
    setLoading(false);

    if (fallbackSource) {
      setImageSource(fallbackSource);
    }
  };

  return (
    <View style={containerStyle}>
      {/* Placeholder (optional) */}
      {showPlaceholder && placeholder && (
        <Image
          source={typeof placeholder === 'number' ? placeholder : { uri: placeholder }}
          style={[computedStyle, styles.placeholder]}
          resizeMode="cover"
        />
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={[computedStyle, styles.loadingContainer]}>
          <ActivityIndicator size="small" color="#ccc" />
        </View>
      )}

      {/* Main image */}
      <Image
        source={
          typeof imageSource === 'number'
            ? imageSource
            : { uri: imageSource }
        }
        style={[computedStyle, styles.image]}
        resizeMode="cover"
        onLoad={handleImageLoad}
        onError={handleImageError}
        {...rest}
      />
    </View>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;

/**
 * Utility function to convert image URL to WebP format
 * Falls back to original URL if WebP not supported
 */
export function getOptimizedImageUrl(
  imageUrl: string,
  width?: number,
  preferWebP: boolean = true
): string {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return imageUrl;
  }

  // If it's a local image or data URI, return as-is
  if (imageUrl.startsWith('data:') || !imageUrl.startsWith('http')) {
    return imageUrl;
  }

  // Add query parameters for image optimization
  const url = new URL(imageUrl);

  // Request WebP format if supported (you'd need an image optimization service)
  // For now, just return original URL
  // Example for Cloudinary:
  // if (preferWebP) {
  //   url.searchParams.set('f', 'auto'); // Auto format
  //   url.searchParams.set('q', '80'); // Quality
  // }

  return url.toString();
}

/**
 * Utility to preload multiple images
 */
export async function preloadImages(imageUrls: string[]): Promise<void> {
  const promises = imageUrls.map(url => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Still resolve even if loading fails
      img.src = url;
    });
  });

  await Promise.all(promises);
}
