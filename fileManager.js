const FileManager = (() => {
    let _ipcRenderer;
    let _elements;

    async function fetchFoldersInternal() {
        if (!_ipcRenderer || !_elements || !_elements.folderList) {
            console.error("FileManager is not initialized properly or folderList element is missing.");
            return;
        }
        console.log("FileManager: Requesting folder data...");
        _elements.folderList.innerHTML = '<li>Loading folders...</li>';
        try {
            const result = await _ipcRenderer.invoke('fetch-data', 'api/folders/');
            console.log('FileManager: Received folder data:', result);
            if (result.success) {
                populateFolderListInternal(result.data);
            } else {
                console.error('FileManager: Failed to fetch folders:', result.error);
                _elements.folderList.innerHTML = '<li>Error loading folders</li>';
            }
        } catch (error) {
            console.error('FileManager: IPC Error', error);
            _elements.folderList.innerHTML = '<li>Error loading folders</li>';
            
        }
    }

function populateFolderListInternal(folders) {
        if (!_elements || !_elements.folderList) return;
        _elements.folderList.innerHTML = ''; 
        if (!folders || folders.length === 0) {
            _elements.folderList.innerHTML = '<li>No folders found.</li>';
            return;
        }
        folders.forEach(folder => {
            const folderLi = document.createElement('li');
            folderLi.classList.add('folder-item');
            folderLi.dataset.folderId = folder.id;
            folderLi.dataset.expanded = 'false';

            const toggleIcon = document.createElement('span');
            toggleIcon.classList.add('toggle-icon');
            toggleIcon.textContent = '▶ ';

            const folderNameSpan = document.createElement('span');
            folderNameSpan.classList.add('folder-name');
            folderNameSpan.textContent = folder.name || `Folder ${folder.id}`;
            
            folderLi.appendChild(toggleIcon);
            folderLi.appendChild(folderNameSpan);

            const videosUl = document.createElement('ul');
            videosUl.classList.add('video-sublist');
            videosUl.style.display = 'none';
            folderLi.appendChild(videosUl);

            folderLi.addEventListener('click', async (event) => {
                if (event.target.closest('.video-item')) {
                    return;
                }

                const isExpanded = folderLi.dataset.expanded === 'true';
                if (isExpanded) {
                    folderLi.dataset.expanded = 'false';
                    toggleIcon.textContent = '▶ ';
                    videosUl.style.display = 'none';
                } else {
                    folderLi.dataset.expanded = 'true';
                    toggleIcon.textContent = '▼ ';
                    videosUl.style.display = 'block';
                    if (videosUl.children.length === 0) {
                        await fetchVideosForFolderInternal(folder.id, videosUl);
                    }
                }
            });
            _elements.folderList.appendChild(folderLi);
        });
    }

    async function fetchVideosForFolderInternal(folderId, videosUlElement) {
        if (!_ipcRenderer) return;
        videosUlElement.innerHTML = '<li>Loading videos...</li>';
        console.log(`FileManager: Fetching videos for folder ID: ${folderId}`);
        try {
            const result = await _ipcRenderer.invoke('fetch-data', `api/videos/?folder=${folderId}`);
            console.log(`FileManager: Received videos for folder ${folderId}:`, result);
            if (result.success) {
                displayVideosInFolderInternal(result.data, videosUlElement);
            } else {
                console.error(`FileManager: Failed to fetch videos for folder ${folderId}:`, result.error);
                videosUlElement.innerHTML = '<li>Error loading videos.</li>';
            }
        } catch (error) {
            console.error(`FileManager: IPC Error fetching videos for folder ${folderId}:`, error);
            videosUlElement.innerHTML = '<li>Error loading videos via IPC.</li>';
        }
    }

    function displayVideosInFolderInternal(videos, videosUlElement) {
        videosUlElement.innerHTML = '';
        if (!videos || videos.length === 0) {
            videosUlElement.innerHTML = '<li>No videos in this folder.</li>';
            return;
        }
        videos.forEach(video => {
            const videoLi = document.createElement('li');
            videoLi.classList.add('video-item');
            videoLi.textContent = video.title || video.file || `Video ${video.id}`;
            //TODO: Add click to play video from File Manager. 
            videosUlElement.appendChild(videoLi);
        });
    }

    return {
        init: (ipcRendererInstance, domElements) => {
            _ipcRenderer = ipcRendererInstance;
            _elements = domElements; 
        },
        activateView: () => {
            if (!_elements || !_elements.fileManagerView || !_elements.folderList) return;
            
            const currentContent = _elements.folderList.textContent.trim();
            if (_elements.folderList.children.length === 0 || 
                currentContent === 'Error loading folders.' || 
                currentContent === 'No folders found.' ||
                currentContent === 'Error loading folders via IPC.' ||
                currentContent === 'Loading folders...') {
                fetchFoldersInternal();
            }
        }
    };
})();