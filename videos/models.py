from django.db import models
import os
# Create your models here.

def get_video_upload_path(instance, filename):
    return os.path.join(instance.folder.name, filename)

class Folder(models.Model):
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        ordering = ['name']
        
class Video(models.Model):
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to=get_video_upload_path)
    folder = models.ForeignKey(Folder, related_name='videos', on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    participant_data = models.JSONField(null=True, blank=True)
    def __str__(self):
        return self.title
    
    class Meta:
        ordering = ['-uploaded_at']
        
        
    