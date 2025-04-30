from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FolderViewSet, VideoViewSet

router = DefaultRouter()
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'videos', VideoViewSet, basename='video')

urlpatterns = [
    path('', include(router.urls))
]
