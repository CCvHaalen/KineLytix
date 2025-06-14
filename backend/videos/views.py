from rest_framework import viewsets, permissions, parsers
from .models import Folder, Video
from .serializers import FolderSerializer, VideoSerializer, FolderWithVideosSerializer
import logging
# Create your views here.

logger = logging.getLogger(__name__)

class FolderViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows folders to be viewed or edited.
    """
    queryset = Folder.objects.all().order_by('-created_at')
    permission_classes = [permissions.AllowAny] #Adjust permissions if needed
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return FolderWithVideosSerializer
        return FolderSerializer
    
    def perform_create(self, serializer):
        instance = serializer.save()
        logger.info(f"New Project Folder added: ID={instance.id}, Name={instance.name}")
    
class VideoViewSet(viewsets.ModelViewSet):
    queryset = Video.objects.all()
    serializer_class = VideoSerializer
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Video.objects.all()
        folder_id = self.request.query_params.get('folder')
        if folder_id:
            queryset = queryset.filter(folder_id=folder_id)
        return queryset.order_by('-uploaded_at')
    
    def perform_create(self, serializer):
        serializer.save(file=self.request.data.get('file'))
        