from rest_framework import serializers
from .models import Folder, Video

class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ['id', 'name', 'created_at']

class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = ['id', 'title', 'file', 'folder', 'uploaded_at']
        read_only_fields = ['uploaded_at']
        
class FolderWithVideosSerializer(serializers.ModelSerializer):
    videos = VideoSerializer(many=True, read_only=True)
        
    class Meta:
        model = Folder
        fields = ['id', 'name', 'created_at', 'videos']
            