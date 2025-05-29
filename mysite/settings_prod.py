import os
from pathlib import Path
from .settings import *               # ← pull in all your base settings

# Override for “production” desktop-bundle
DEBUG = False
ALLOWED_HOSTS = ['127.0.0.1', 'localhost']

# STATIC files go here when you run collectstatic
# must be a real filesystem path
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATIC_URL = '/static/'

# (optional) if you serve media
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
MEDIA_URL = '/media/'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False, 
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} P{process:d} T{thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {asctime} {module}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler', 
            'formatter': 'simple', 
        },
    },
    'root': { 
        'handlers': ['console'],
        'level': 'INFO', 
    },
    'loggers': {
        'django': { 
            'handlers': ['console'],
            'level': 'WARNING', 
            'propagate': False, 
        },
        'django.request': { 
            'handlers': ['console'],
            'level': 'WARNING', 
            'propagate': False,
        },
        'waitress': { 
            'handlers': ['console'],
            'level': 'INFO', 
            'propagate': False,
        },
        'videos': { 
            'handlers': ['console'],
            'level': 'INFO',       
            'propagate': False,    
        },
    }
}