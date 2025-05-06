import logging
import av.logging

av.logging.set_level(av.logging.ERROR)

# Configure logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)
