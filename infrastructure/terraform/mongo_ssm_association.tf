############################################################
# Ensure mongod listens on 0.0.0.0:27017 and auth is enabled
# Runs continuously via SSM Association on instances tagged
# Name=terraform-mongo. Permanent and applies to replacements.
#
# Requirements:
#   - The Mongo EC2 has SSM Agent + IAM role for SSM
#   - aws_instance.mongodb exists (for dependency)
############################################################

resource "aws_ssm_association" "mongo_enable_remote_auth" {
  name = "AWS-RunShellScript"

  targets {
    key    = "tag:Name"
    values = ["terraform-mongo"]
  }

  parameters = {
    commands = [<<-'SCRIPT'
      #!/usr/bin/env bash
      set -euo pipefail
      CONF=/etc/mongod.conf
      if [ ! -f "$CONF" ]; then
        echo "mongod.conf not found at $CONF" >&2
        exit 1
      fi
      sudo cp -an "$CONF" "$CONF.bak.$(date +%s)" || true

      # Ensure net.bindIp: 0.0.0.0
      if grep -qE '^[[:space:]]*bindIp:' "$CONF"; then
        sudo sed -ri 's/^\s*bindIp\s*:\s*.*/  bindIp: 0.0.0.0/' "$CONF"
      else
        sudo awk '{print} /^net:/{print "  bindIp: 0.0.0.0"}' "$CONF" | sudo tee "$CONF.new" >/dev/null && sudo mv "$CONF.new" "$CONF"
      fi

      # Ensure net.port: 27017
      if grep -qE '^[[:space:]]*port:' "$CONF"; then
        sudo sed -ri 's/^\s*port\s*:\s*.*/  port: 27017/' "$CONF"
      else
        sudo awk '{print} /^net:/{print "  port: 27017"}' "$CONF" | sudo tee "$CONF.new" >/dev/null && sudo mv "$CONF.new" "$CONF"
      fi

      # Ensure security.authorization: enabled
      if grep -q '^security:' "$CONF"; then
        if grep -qE '^[[:space:]]*authorization:' "$CONF"; then
          sudo sed -ri 's/^\s*authorization\s*:\s*.*/  authorization: enabled/' "$CONF"
        else
          sudo awk '{print} /^security:/{print "  authorization: enabled"}' "$CONF" | sudo tee "$CONF.new" >/dev/null && sudo mv "$CONF.new" "$CONF"
        fi
      else
        printf "\nsecurity:\n  authorization: enabled\n" | sudo tee -a "$CONF" >/dev/null
      fi

      sudo systemctl restart mongod
      sleep 1
      ss -lntp | grep ':27017' || true
    SCRIPT]
  }

  # Ensure association is created after the Mongo instance exists
  depends_on = [aws_instance.mongodb]
}
