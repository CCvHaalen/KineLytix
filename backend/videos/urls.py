from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FolderViewSet, VideoViewSet
#from pose_detection.views import detect_pose

router = DefaultRouter()
router.register(r'folders', FolderViewSet)
router.register(r'videos', VideoViewSet)

urlpatterns = [
#    path('pose-detect/', detect_pose, name='pose_detect'),

    path('', include(router.urls)),
]
